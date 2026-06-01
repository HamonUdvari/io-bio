// Generate an up-to-date, human-readable record of every cosmetic edit applied
// to the source biography docx files — as Markdown and a Chrome-rendered PDF.
//
// Drives entirely off the `transforms` registry in bios-transforms.ts (no docx
// unzip), so it covers ALL transforms — including the legacy-.doc sources that
// `npm run bios:diff` can't auto-diff. Output → bios-deliverables/.
//
// Usage: node scripts/generate-changes-doc.ts
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { marked } from "marked";
import { transforms } from "./bios-transforms.ts";
import {
  PRINT_TO_PDF_OPTS,
  chromeWsUrl,
  connectCdp,
} from "./zenodo-render-pdfs.ts";

// Mirror of the (unexported) chromeBin() in zenodo-render-pdfs.ts.
function chromeBin(): string {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  if (process.platform === "darwin")
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "google-chrome";
}

const OUT_DIR = path.resolve("bios-deliverables");
const MD_PATH = path.join(OUT_DIR, "io-bio-bios-changes.md");
const HTML_PATH = path.join(OUT_DIR, "io-bio-bios-changes.html");
const PDF_PATH = path.join(OUT_DIR, "io-bio-bios-changes.pdf");

// Short category for the summary table (the full reason is in each section).
// Unknown sources fall back to "—" so a new transform still appears, just
// without a hand-written category.
const CATEGORY: Record<string, string> = {
  "Lubbers-R 2026.docx": "Name aside format",
  "Holtrop-MW 2021.docx": "Name aside format",
  "Clausen-AW 2015.docx": "Name aside, nationality & role split",
  "Bonnet-H 2024.docx": "Clause order",
  "Black-ER 2014.docx": "Missing nationality",
  "Orr-JB 2021.docx": "Missing nationality",
  "Pastizzi-D 2024.docx": "Missing nationality",
  "Wyndham White-E 2012.docx": "Role–organisation structure",
  "Phelan-EJ 2016.docx": "Role–organisation structure",
  "Robinson-MTW 2014.docx": "Missing nationality",
  "Rey-F 2025.docx": "Role connector",
  "Saouma-E 2013.docx": "Sentence join & missing nationality",
  "McDonald-JG 2016.docx": "Role–organisation order",
  "Diallo-BT 2022.docx": "Abbreviation format",
  "Thant-U 2019.docx": "Role–organisation structure",
  "Van Heuven Goedhart-GJ 2012.docx": "Missing nationality",
};

// Transform sources whose ORIGINAL arrived as a legacy .doc (converted to .docx
// by LibreOffice before the edit was applied).
const LEGACY_DOC = new Set([
  "Saouma-E 2013.docx",
  "Van Heuven Goedhart-GJ 2012.docx",
]);

function buildMarkdown(): string {
  const today = new Date().toISOString().slice(0, 10);
  const fileCount = transforms.length;
  const changeCount = transforms.reduce((n, t) => n + t.changes.length, 0);

  const L: string[] = [];
  L.push("# IO BIO — Source Document Changes");
  L.push("");
  L.push(
    `_Generated ${today} from \`scripts/bios-transforms.ts\` — ${fileCount} files edited, ${changeCount} individual changes._`,
  );
  L.push("");

  // --- Context ---
  L.push("## What this is");
  L.push("");
  L.push(
    "The biographical entries are authored as Microsoft Word `.docx` files. To build the website and the per-entry PDFs, an automated loader parses each file's opening paragraph into structured fields — surname, first name, nationality, roles, organisations and dates. A small number of source files used phrasing the parser could not read, so the build applies the **cosmetic, meaning-preserving** text fixes listed below before parsing.",
  );
  L.push("");
  L.push(
    "- The **originals are kept untouched** in `bios-source/`; the edited copies live in `bios-processed/`, which is what the site actually builds from.",
  );
  L.push(
    "- Every change is **about wording and format only**, so the parser can extract the data — no biographical facts were altered. Where a nationality was added, it was a clear, uncontested fact (e.g. from the subject's birthplace); each such case is noted in its reason.",
  );
  L.push(
    "- Two of the edited files (**Saouma** and **Van Heuven Goedhart**) arrived in the legacy `.doc` format and were converted to `.docx` before editing — so for those the *original* is a `.doc` and the *changed* file is a `.docx`.",
  );
  L.push("");

  // --- Summary table ---
  L.push("## Summary");
  L.push("");
  L.push("| # | File | Changes | Type |");
  L.push("|--:|------|:------:|------|");
  transforms.forEach((t, i) => {
    const legacy = LEGACY_DOC.has(t.source) ? " *(orig. .doc)*" : "";
    L.push(
      `| ${i + 1} | ${t.source}${legacy} | ${t.changes.length} | ${CATEGORY[t.source] ?? "—"} |`,
    );
  });
  L.push("");

  // --- Per-file detail ---
  L.push("## Changes by file");
  L.push("");
  transforms.forEach((t, i) => {
    const legacy = LEGACY_DOC.has(t.source)
      ? " — _original was a legacy `.doc`, converted to `.docx` before editing_"
      : "";
    L.push(`### ${i + 1}. ${t.source}${legacy}`);
    L.push("");
    t.changes.forEach((c, j) => {
      if (t.changes.length > 1) L.push(`**Change ${j + 1} of ${t.changes.length}**`);
      L.push("");
      L.push(`**Why it was needed:** ${c.reason}`);
      L.push("");
      L.push("*Before:*");
      L.push("");
      L.push("```text");
      L.push(c.find);
      L.push("```");
      L.push("");
      L.push("*After:*");
      L.push("");
      L.push("```text");
      L.push(c.replace);
      L.push("```");
      L.push("");
    });
  });

  // --- Appendix: parser-side fixes ---
  L.push("## Appendix — corrections made in the parser (not the docx)");
  L.push("");
  L.push(
    "For completeness: a few issues raised in review were fixed in the parser code (`src/content/loaders/parsers/`) rather than by editing the source text, so no docx change appears above for them:",
  );
  L.push("");
  L.push(
    "- **McDonald-JG** — the wrong nationality (\"German\", a substring of \"…Germany\") is corrected by having the parser select the *earliest* demonym in the text (`parseNationality.ts`), so the leading nationality wins.",
  );
  L.push(
    "- **Mid-sentence abbreviations** — acronyms such as `(BofA)` or `(IBRD)` are now captured wherever they appear in a role, not only at the end (`parseRoles.ts`).",
  );
  L.push(
    "- **Source spelling preserved** — demonyms render exactly as written in the source (e.g. \"Argentinean\" vs \"Argentine\") rather than being normalised (`parseNationality.ts`).",
  );
  L.push(
    "- **Institution back-fill** — well-known role-as-institution titles (e.g. UN High Commissioner for Refugees → UNHCR) have their organisation/abbreviation filled in by the parser's alias table when the author omitted it, so no per-file docx edit is needed (`parseRoles.ts`).",
  );
  L.push("");
  L.push("---");
  L.push("");
  L.push(
    "_Source of truth: `scripts/bios-transforms.ts`. Regenerate this document with `npm run bios:changes-doc`._",
  );
  L.push("");
  return L.join("\n");
}

function buildHtml(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IO BIO — Source Document Changes</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: #1a1a1a; margin: 0;
  }
  h1 { font-size: 21pt; margin: 0 0 .2em; }
  h2 { font-size: 14pt; margin: 1.6em 0 .5em; padding-bottom: .15em;
       border-bottom: 1px solid #ddd; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 1.3em 0 .3em; break-after: avoid; }
  p { margin: .45em 0; }
  em { color: #555; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: .6em 0; }
  th, td { border: 1px solid #ccc; padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: #f1f1f1; }
  td:nth-child(1), td:nth-child(3) { text-align: center; white-space: nowrap; }
  pre { background: #f6f7f8; border: 1px solid #e2e4e6; border-radius: 3px;
        padding: 7px 9px; margin: .3em 0 .7em; font-size: 8.8pt; line-height: 1.45;
        white-space: pre-wrap; word-break: break-word; break-inside: avoid;
        font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; }
  code { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; }
  li { margin: .25em 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
  a { color: #0a66c2; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

async function renderHtmlToPdf(fileUrl: string, outPath: string): Promise<void> {
  const CHROME_PORT = Number(process.env.DOC_CHROME_PORT ?? 9223);
  const chrome = spawn(
    chromeBin(),
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
  try {
    const cdp = await connectCdp(await chromeWsUrl(CHROME_PORT));
    try {
      await cdp.send("Page.enable");
      const loaded = cdp.waitEvent("Page.loadEventFired");
      await cdp.send("Page.navigate", { url: fileUrl });
      await loaded;
      // brief settle so layout/fonts are final before printing
      await new Promise((r) => setTimeout(r, 300));
      const { stream } = await cdp.send("Page.printToPDF", {
        ...PRINT_TO_PDF_OPTS,
        transferMode: "ReturnAsStream",
      });
      const chunks: Buffer[] = [];
      for (;;) {
        const r = await cdp.send("IO.read", { handle: stream, size: 1 << 20 });
        if (r.data)
          chunks.push(Buffer.from(r.data, r.base64Encoded ? "base64" : "utf8"));
        if (r.eof) break;
      }
      await cdp.send("IO.close", { handle: stream });
      writeFileSync(outPath, Buffer.concat(chunks));
    } finally {
      cdp.close();
    }
  } finally {
    chrome.kill("SIGTERM");
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const md = buildMarkdown();
  writeFileSync(MD_PATH, md);
  console.log(
    `  markdown → ${path.relative(process.cwd(), MD_PATH)} (${transforms.length} files)`,
  );

  const bodyHtml = await marked.parse(md);
  writeFileSync(HTML_PATH, buildHtml(bodyHtml));

  await renderHtmlToPdf(pathToFileURL(HTML_PATH).href, PDF_PATH);
  console.log(`  pdf      → ${path.relative(process.cwd(), PDF_PATH)}`);
}

main()
  .then(() => console.log("done"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
