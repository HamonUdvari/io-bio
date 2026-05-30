// Render entry pages to PDF (the artifact deposited per Zenodo record), using
// the same headless Chrome we use for screenshots — no Playwright dependency.
// Assumes `astro build` has produced `dist/`. Spawns `astro preview`, prints
// each requested entry's page to `dist-pdf/<slug>.pdf`, then stops preview.
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE = (process.env.SITE_BASE ?? "/io-bio").replace(/\/$/, "");
const PORT = Number(process.env.ZENODO_PREVIEW_PORT ?? 4399);
const OUT_DIR = path.resolve("dist-pdf");

function chromeBin(): string {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  if (process.platform === "darwin")
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "google-chrome"; // Linux/CI — or set CHROME_BIN (e.g. chromium)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url: string, timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status === 404) return; // server is up (404 = routing works)
    } catch {
      /* not ready yet */
    }
    if (Date.now() > deadline) throw new Error(`preview not ready at ${url}`);
    await sleep(400);
  }
}

/**
 * Render the given slugs to dist-pdf/<slug>.pdf. Returns a map slug → pdf path.
 * Throws if dist/ is missing.
 */
export async function renderPdfs(slugs: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (slugs.length === 0) return result;

  if (!existsSync(path.resolve("dist")))
    throw new Error("dist/ not found — run `npm run build` first.");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const preview = spawn(
    npmCmd,
    ["run", "preview", "--", "--port", String(PORT)],
    { cwd: process.cwd(), stdio: "ignore" },
  );
  // Ensure the preview server is killed even on Ctrl-C / SIGTERM (finally alone
  // doesn't run when the process is signalled), so it can't squat PORT.
  const onSignal = () => {
    try {
      preview.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    await waitForServer(`http://localhost:${PORT}${BASE}/`);
    const bin = chromeBin();
    for (const slug of slugs) {
      const url = `http://localhost:${PORT}${BASE}/entries/${slug}`;
      const out = path.join(OUT_DIR, `${slug}.pdf`);
      await execFileAsync(bin, [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=8000",
        `--print-to-pdf=${out}`,
        url,
      ]);
      if (!existsSync(out)) throw new Error(`Chrome did not produce ${out}`);
      result.set(slug, out);
      console.log(`  rendered ${slug} → ${path.relative(process.cwd(), out)}`);
    }
  } finally {
    preview.kill("SIGTERM");
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  return result;
}

// --- standalone CLI: `node scripts/zenodo-render-pdfs.ts <slug...>` ---
const invokedDirectly = process.argv[1]?.endsWith("zenodo-render-pdfs.ts");
if (invokedDirectly) {
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (slugs.length === 0) {
    console.error("usage: node scripts/zenodo-render-pdfs.ts <slug> [slug...]");
    process.exit(1);
  }
  renderPdfs(slugs)
    .then(() => console.log("done"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
