// Render every built entry to dist/entries/<slug>.pdf — the path the on-site
// "Download (PDF)" button links to — reusing the Zenodo render pipeline (CDP
// Page.printToPDF with the per-page footer). Run AFTER `astro build`, before
// the Pages artifact is uploaded.
//
// Incremental: each entry's built index.html is hashed. That hash captures the
// text, the content-hashed image URL, AND the bundled-CSS link hash — so any
// content or print-style change flips it, while a JS-only / unrelated change
// does not. Rendered PDFs + a manifest of those hashes live in .pdf-cache/,
// persisted across CI runs via actions/cache; unchanged entries are copied
// straight from the cache and only changed/new ones are re-rendered.
//
// Rendering still fails hard (renderPdfs throws): a bad entry fails the deploy
// rather than shipping a stale or missing PDF.
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { renderPdfs } from "./zenodo-render-pdfs.ts";

const distEntries = path.resolve("dist/entries");
const cacheDir = path.resolve(".pdf-cache");
const manifestPath = path.join(cacheDir, "manifest.json");

if (!existsSync(distEntries)) {
  console.error("dist/entries not found — run the build first.");
  process.exit(1);
}
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

// Each built entry is a dist/entries/<slug>/ directory (with index.html).
const slugs = readdirSync(distEntries, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
if (slugs.length === 0) {
  console.error("No entry directories found under dist/entries.");
  process.exit(1);
}

// Optional first arg limits how many entries to consider (handy for testing).
const limit = Number(process.argv[2]);
const targets =
  Number.isFinite(limit) && limit > 0 ? slugs.slice(0, limit) : slugs;

const prev: Record<string, string> = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};

const hashOf = (slug: string) =>
  createHash("sha256")
    .update(readFileSync(path.join(distEntries, slug, "index.html")))
    .digest("hex");

const next: Record<string, string> = {};
const toRender: string[] = [];
let reused = 0;
for (const slug of targets) {
  const h = hashOf(slug);
  next[slug] = h;
  const cached = path.join(cacheDir, `${slug}.pdf`);
  if (prev[slug] === h && existsSync(cached)) {
    copyFileSync(cached, path.join(distEntries, `${slug}.pdf`));
    reused++;
  } else {
    toRender.push(slug);
  }
}
console.log(
  `Entry PDFs: ${reused} reused from cache, ${toRender.length} to render (of ${targets.length}).`,
);

if (toRender.length > 0) {
  // renderPdfs throws on any failure → the deploy fails (no stale/missing PDF).
  await renderPdfs(toRender, distEntries);
  for (const slug of toRender) {
    const out = path.join(distEntries, `${slug}.pdf`);
    if (!existsSync(out)) throw new Error(`expected ${out} after render`);
    copyFileSync(out, path.join(cacheDir, `${slug}.pdf`));
  }
}

// Persist the manifest only after every requested PDF is present.
writeFileSync(manifestPath, JSON.stringify(next));
console.log(`done — ${targets.length} PDFs in dist/entries (${reused} cached).`);
