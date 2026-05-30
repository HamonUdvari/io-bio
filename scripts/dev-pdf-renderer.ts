// Astro DEV-only integration: serve the per-entry PDF on demand so the
// "Download (PDF)" button works under `astro dev`. The downloadable PDF
// (dist/entries/<slug>.pdf) is a build/CI artifact rendered by pnpm pdfs:site —
// it doesn't exist in dev, so the dev server would 404 the URL and the browser
// would save the 404 HTML under the .pdf name. This middleware intercepts
// GET <base>/entries/<slug>.pdf and renders it on the fly from the live
// /print/<slug> route through the same headless-Chrome → Paged.js path as the
// deployed PDF, so the download always reflects the current CSS.
//
// It's inert outside `astro dev`: in build the hook never runs, and in
// `astro preview` the real static PDF exists, so we don't intercept (guarded on
// command === "dev"). One headless Chrome is spawned lazily on the first
// request and reused; renders are serialised (single CDP page target).
import { spawn, type ChildProcess } from "node:child_process";
import type { AstroIntegration } from "astro";
import { chromeWsUrl, connectCdp, renderPdfBytes } from "./zenodo-render-pdfs.ts";

type Cdp = Awaited<ReturnType<typeof connectCdp>>;

const CHROME =
  process.env.CHROME_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

export function devPdfRenderer(base = "/io-bio"): AstroIntegration {
  const b = base.replace(/\/$/, "");
  let command = "dev";
  let chrome: ChildProcess | undefined;
  let cdpPromise: Promise<Cdp> | undefined;
  // Serialise renders: one Chrome page target can print one PDF at a time.
  let queue: Promise<unknown> = Promise.resolve();

  // Drop the cached connection (and its Chrome) so the next request respawns
  // fresh — used both when a connect attempt fails and when a live socket dies.
  const resetCdp = () => {
    cdpPromise = undefined;
    chrome?.kill("SIGTERM");
    chrome = undefined;
  };

  const getCdp = (): Promise<Cdp> => {
    if (!cdpPromise) {
      const port = Number(process.env.DEV_PDF_CHROME_PORT ?? 9444);
      chrome = spawn(
        CHROME,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--hide-scrollbars",
          `--remote-debugging-port=${port}`,
          "about:blank",
        ],
        { stdio: "ignore" },
      );
      cdpPromise = chromeWsUrl(port)
        // If the socket later dies (Chrome crash/restart), drop the singleton so
        // the next request reconnects instead of reusing a dead connection.
        .then((wsUrl) => connectCdp(wsUrl, resetCdp))
        .then(async (cdp) => {
          await cdp.send("Page.enable");
          return cdp;
        })
        .catch((e) => {
          // Don't poison the singleton on a failed connect — reset so the next
          // request retries a fresh spawn instead of re-awaiting a rejection.
          resetCdp();
          throw e;
        });
    }
    return cdpPromise;
  };

  return {
    name: "dev-pdf-renderer",
    hooks: {
      "astro:config:setup": ({ command: cmd }) => {
        command = cmd;
      },
      "astro:server:setup": ({ server, logger }) => {
        if (command !== "dev") return;
        // Vite strips the configured base from req.url before middlewares run,
        // so match the base-stripped path; the base prefix is optional for
        // safety. Trailing ?query allowed (Tier 3 cache-busts with ?t=…).
        const re = new RegExp(`^(?:${b})?/entries/([^/?#]+)\\.pdf(?:[?#]|$)`);
        // Prepend so we run before Astro's catch-all route (which would 404).
        (server.middlewares.stack as Array<{ route: string; handle: unknown }>).unshift({
          route: "",
          handle: (req: any, res: any, next: () => void) => {
            const m = req.url?.match(re);
            if (!m) return next();
            const slug = m[1];
            const host = req.headers.host ?? "localhost";
            const target = `http://${host}${b}/print/${slug}`;
            queue = queue
              .then(async () => {
                const t = Date.now();
                const bytes = await renderPdfBytes(await getCdp(), target);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Length", String(bytes.length));
                res.setHeader("Content-Disposition", `inline; filename="${slug}.pdf"`);
                res.setHeader("Cache-Control", "no-store");
                res.end(bytes);
                logger.info(`rendered ${slug}.pdf on demand (${Date.now() - t}ms)`);
              })
              .catch((e: Error) => {
                logger.error(`PDF render failed for ${slug}: ${e.message}`);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "text/plain");
                  res.end(`PDF render failed: ${e.message}`);
                }
              });
          },
        });
        logger.info("dev PDF renderer active — /entries/<slug>.pdf renders live");
      },
      "astro:server:done": async () => {
        try {
          (await cdpPromise)?.close();
        } catch {
          /* never connected */
        }
        chrome?.kill("SIGTERM");
      },
    },
  };
}
