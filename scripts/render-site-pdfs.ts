// Render every built entry to dist/entries/<slug>.pdf — the path the on-site
// "Download (PDF)" button links to — reusing the Zenodo render pipeline (CDP
// Page.printToPDF with the per-page footer). Run AFTER `astro build`, before
// the Pages artifact is uploaded. The PDFs sit alongside each entry's
// dist/entries/<slug>/ directory, so they serve at /<base>/entries/<slug>.pdf.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderPdfs } from "./zenodo-render-pdfs.ts";

const entriesDir = path.resolve("dist/entries");
if (!existsSync(entriesDir)) {
  console.error("dist/entries not found — run the build first.");
  process.exit(1);
}

// Each built entry is a dist/entries/<slug>/ directory (with index.html).
const slugs = readdirSync(entriesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (slugs.length === 0) {
  console.error("No entry directories found under dist/entries.");
  process.exit(1);
}

// Optional first arg limits how many entries to render (handy for testing).
const limit = Number(process.argv[2]);
const targets =
  Number.isFinite(limit) && limit > 0 ? slugs.slice(0, limit) : slugs;

console.log(
  `Rendering ${targets.length}/${slugs.length} entry PDFs into dist/entries/ …`,
);
renderPdfs(targets, entriesDir)
  .then((m) => console.log(`done — ${m.size}/${targets.length} PDFs`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
