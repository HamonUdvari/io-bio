// Spot-check ONE entry's rendered PDF straight from the running `astro dev`
// server (default :4322 — hot CSS reload, no build) and open it. It prints the
// Paged.js /print/<slug> route through the same CDP path as production, so the
// output matches the deployed PDF (footer + page numbers come from the @page
// margin boxes in global.css).
//
//   pnpm pdf:dev <slug> [devOrigin] [--watch]
//
// --watch keeps one headless Chrome alive and re-renders whenever a print input
// changes (src/styles/global.css, EntryArticle.astro, the print route, Image —
// hot-reloaded by astro dev, so a fresh navigation re-paginates). macOS Preview
// reloads the file in place, so the open PDF refreshes on each render.
//
// For the fast in-browser DESIGN loop, open /io-bio/print/<slug> directly in a
// browser — that's the live, inspectable Paged.js preview that auto-reloads on
// CSS save. This script is for eyeballing the actual rendered PDF.
// Set PDF_NO_OPEN=1 to skip launching the viewer.
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromeWsUrl, connectCdp, printPageToPdf } from "./zenodo-render-pdfs.ts";

const argv = process.argv.slice(2);
const watchMode = argv.includes("--watch") || argv.includes("-w");
const positional = argv.filter((a) => !a.startsWith("-"));
const slug = positional[0];
if (!slug) {
  console.error("usage: pnpm pdf:dev <slug> [devOrigin] [--watch]");
  process.exit(1);
}
const origin = (positional[1] ?? "http://localhost:4322/io-bio").replace(
  /\/$/,
  "",
);
const url = `${origin}/print/${slug}`;
const out = path.join(os.tmpdir(), `io-bio-pdf-${slug}.pdf`);

const CHROME =
  process.env.CHROME_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");
const PORT = Number(process.env.PDF_DEV_CHROME_PORT ?? 9333);

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const cleanup = () => {
  try {
    chrome.kill("SIGTERM");
  } catch {
    /* already gone */
  }
};

const cdp = await connectCdp(await chromeWsUrl(PORT));
await cdp.send("Page.enable");

let opened = false;
const render = async () => {
  const t = Date.now();
  await printPageToPdf(cdp, url, out);
  console.log(`→ ${out}  (${Date.now() - t}ms)`);
  if (!opened && !process.env.PDF_NO_OPEN && process.platform === "darwin") {
    spawn("open", [out], { stdio: "ignore", detached: true }).unref();
    opened = true;
  }
};

console.log(`rendering ${url} …`);
await render();

if (!watchMode) {
  cdp.close();
  cleanup();
} else {
  // Coalesce bursts of fs events, and never run two renders at once.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let again = false;
  const run = () => {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    render()
      .catch((e) => console.error(`render failed: ${(e as Error).message}`))
      .finally(() => {
        busy = false;
        if (again) {
          again = false;
          run();
        }
      });
  };
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 350);
  };

  // Re-render when a hot-reloadable input changes (the dev server re-serves the
  // updated page on the next navigation).
  const HINTS = ["global.css", "EntryArticle.astro", "[slug].astro", "Image.astro"];
  watch(path.resolve("src"), { recursive: true }, (_e, f) => {
    if (f && HINTS.some((h) => String(f).endsWith(h))) debounced();
  });
  // Footer/margins are imported into this process; flag that they need a restart.
  watch(path.resolve("scripts"), (_e, f) => {
    if (f && String(f).endsWith("zenodo-render-pdfs.ts"))
      console.log(
        "⚠ render script changed — restart `pnpm pdf:dev --watch` to apply footer/margin edits.",
      );
  });

  console.log("watching src/ for print-style changes (Ctrl-C to stop) …");
  process.on("SIGINT", () => {
    try {
      cdp.close();
    } catch {
      /* ignore */
    }
    cleanup();
    process.exit(0);
  });
}
