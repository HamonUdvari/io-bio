// Render entry pages to PDF (the artifact deposited per Zenodo record), using
// the same headless Chrome we use for screenshots — no Playwright dependency.
// Assumes `astro build` has produced `dist/`. Spawns `astro preview`, prints
// each requested entry's page to `dist-pdf/<slug>.pdf`, then stops preview.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

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

// Footer drawn on every PDF page (matches the print reference, issue #8):
// project reference bottom-left, page number bottom-right. Chrome's print
// header/footer templates inherit no page CSS and default to a tiny font, so
// styling is inlined here; `.pageNumber` is Chrome's built-in class.
const FOOTER_TEMPLATE = `<div style="width:100%;font-size:8px;color:#555;padding:0 14mm;box-sizing:border-box;font-family:Roboto,Arial,sans-serif;">
  <span style="float:left;">IO BIO — Biographical Dictionary of Secretaries-General of International Organizations</span>
  <span style="float:right;"><span class="pageNumber"></span></span>
</div>`;
const EMPTY_HEADER = "<span></span>";

// Resolve the page target's DevTools WebSocket URL once Chrome is listening.
async function chromeWsUrl(port: number, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const tabs = (await (
        await fetch(`http://localhost:${port}/json`)
      ).json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
      const page = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* devtools not ready yet */
    }
    if (Date.now() > deadline) throw new Error("Chrome DevTools not ready");
    await sleep(250);
  }
}

// Minimal CDP client over a single page target (send command / await event).
function connectCdp(wsUrl: string): Promise<{
  send: (method: string, params?: unknown) => Promise<any>;
  waitEvent: (method: string, timeoutMs?: number) => Promise<any>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, (v: any) => void>();
    const waiters: Array<{ method: string; resolve: (v: any) => void }> = [];
    ws.addEventListener("message", (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(msg.result);
        pending.delete(msg.id);
      } else if (msg.method) {
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].method === msg.method) {
            waiters[i].resolve(msg.params);
            waiters.splice(i, 1);
          }
        }
      }
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res) => {
            const i = ++id;
            pending.set(i, res);
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
        waitEvent: (method, timeoutMs = 15_000) =>
          new Promise((res) => {
            const w = { method, resolve: res };
            waiters.push(w);
            setTimeout(() => {
              const k = waiters.indexOf(w);
              if (k >= 0) waiters.splice(k, 1);
              res(null);
            }, timeoutMs);
          }),
        close: () => ws.close(),
      }),
    );
  });
}

/**
 * Render the given slugs to dist-pdf/<slug>.pdf. Returns a map slug → pdf path.
 * Throws if dist/ is missing.
 */
export async function renderPdfs(
  slugs: string[],
  outDir: string = OUT_DIR,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (slugs.length === 0) return result;

  if (!existsSync(path.resolve("dist")))
    throw new Error("dist/ not found — run `npm run build` first.");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const preview = spawn(
    npmCmd,
    ["run", "preview", "--", "--port", String(PORT)],
    { cwd: process.cwd(), stdio: "ignore" },
  );

  // Headless Chrome with remote debugging, driven over CDP so we can attach a
  // per-page footer (project reference + page number) via Page.printToPDF —
  // the CLI --print-to-pdf flag can't, and Blink ignores @page margin boxes.
  const bin = chromeBin();
  const CHROME_PORT = Number(process.env.ZENODO_CHROME_PORT ?? 9222);
  const chrome = spawn(
    bin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--remote-debugging-port=${CHROME_PORT}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  // Kill both children even on Ctrl-C / SIGTERM (finally alone doesn't run when
  // the process is signalled), so neither squats its port.
  const onSignal = () => {
    try {
      preview.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    try {
      chrome.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    await waitForServer(`http://localhost:${PORT}${BASE}/`);
    const cdp = await connectCdp(await chromeWsUrl(CHROME_PORT));
    try {
      await cdp.send("Page.enable");
      for (const slug of slugs) {
        const url = `http://localhost:${PORT}${BASE}/entries/${slug}`;
        const out = path.join(outDir, `${slug}.pdf`);
        const loaded = cdp.waitEvent("Page.loadEventFired");
        await cdp.send("Page.navigate", { url });
        await loaded;
        await sleep(1200); // settle fonts + images before printing
        // Stream the PDF (ReturnAsStream) rather than base64 inline — entry
        // PDFs embed a full-res portrait and can be tens of MB.
        const { stream } = await cdp.send("Page.printToPDF", {
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: EMPTY_HEADER,
          footerTemplate: FOOTER_TEMPLATE,
          transferMode: "ReturnAsStream",
          marginTop: 0.63, // in ≈ 16mm
          marginBottom: 0.71, // in ≈ 18mm — reserves the footer band
          marginLeft: 0.55, // in ≈ 14mm
          marginRight: 0.55,
        });
        const chunks: Buffer[] = [];
        for (;;) {
          const r = await cdp.send("IO.read", { handle: stream, size: 1 << 20 });
          if (r.data)
            chunks.push(Buffer.from(r.data, r.base64Encoded ? "base64" : "utf8"));
          if (r.eof) break;
        }
        await cdp.send("IO.close", { handle: stream });
        writeFileSync(out, Buffer.concat(chunks));
        if (!existsSync(out)) throw new Error(`Chrome did not produce ${out}`);
        result.set(slug, out);
        console.log(`  rendered ${slug} → ${path.relative(process.cwd(), out)}`);
      }
    } finally {
      cdp.close();
    }
  } finally {
    preview.kill("SIGTERM");
    try {
      chrome.kill("SIGTERM");
    } catch {
      /* already gone */
    }
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
