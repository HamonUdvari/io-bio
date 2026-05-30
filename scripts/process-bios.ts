#!/usr/bin/env node
/**
 * Apply registered text transformations to `bios-source/*.docx`, writing the
 * results to `bios-processed/*.docx`. Files without any registered transforms
 * are copied verbatim. Re-running is idempotent.
 *
 * For each transform we locate the paragraph in `word/document.xml` whose
 * concatenated run text contains the `find` string, apply the replacement to
 * the paragraph's plain text, and rewrite the paragraph's body as a single
 * text run. Internal run formatting (bold/italic) within that one paragraph
 * is therefore flattened — acceptable for intro-line cosmetic fixes.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { transforms, type FileTransform } from "./bios-transforms.ts";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SOURCE_DIR = join(ROOT, "src/content/bios-source");
const PROCESSED_DIR = join(ROOT, "src/content/bios-processed");

function ensureDirs() {
  if (!existsSync(SOURCE_DIR))
    throw new Error(`Missing source dir: ${SOURCE_DIR}`);
  mkdirSync(PROCESSED_DIR, { recursive: true });
}

function copyAllSourceToProcessed() {
  for (const entry of readdirSync(SOURCE_DIR)) {
    if (!/\.docx?$/i.test(entry)) continue;
    cpSync(join(SOURCE_DIR, entry), join(PROCESSED_DIR, entry));
  }
}

/**
 * Convert any legacy `.doc` files in PROCESSED_DIR to `.docx` via LibreOffice,
 * then remove the originals. officeparser doesn't read `.doc`, and the rest
 * of the loader expects `.docx`.
 */
function convertLegacyDocs() {
  for (const entry of readdirSync(PROCESSED_DIR)) {
    if (!/\.doc$/i.test(entry)) continue;
    const docPath = join(PROCESSED_DIR, entry);
    const stem = entry.replace(/\.doc$/i, "");
    const targetPath = join(PROCESSED_DIR, `${stem}.docx`);
    if (existsSync(targetPath)) {
      // Already converted; just remove the .doc so the loader doesn't see it.
      rmSync(docPath, { force: true });
      continue;
    }
    try {
      execSync(
        `soffice --headless --convert-to docx --outdir "${PROCESSED_DIR}" "${docPath}"`,
        { stdio: "pipe", timeout: 60_000 },
      );
      if (existsSync(targetPath)) {
        rmSync(docPath, { force: true });
        console.log(`  ↳ converted ${entry} → ${stem}.docx`);
      } else {
        console.warn(`  ✗ LibreOffice did not produce ${stem}.docx`);
      }
    } catch (err: any) {
      console.warn(`  ✗ failed to convert ${entry}: ${err.message}`);
    }
  }
}

function paragraphText(p: any): string {
  let out = "";
  const runs = p.getElementsByTagNameNS(W_NS, "r");
  for (let i = 0; i < runs.length; i++) {
    const ts = runs[i].getElementsByTagNameNS(W_NS, "t");
    for (let j = 0; j < ts.length; j++) {
      out += ts[j].textContent ?? "";
    }
  }
  return out;
}

/** True if the given <w:r> run contains a <w:drawing> child (embedded image). */
function runContainsDrawing(r: any): boolean {
  const drawings = r.getElementsByTagNameNS(W_NS, "drawing");
  return drawings.length > 0;
}

/**
 * Replace the paragraph's text content with `newText` while preserving:
 *  - its `<w:pPr>` (properties)
 *  - any `<w:r>` runs that contain an embedded drawing (the SG portrait)
 *
 * Text-only runs are removed and replaced by a single new text run appended
 * to the paragraph. The drawing run's relative position in the paragraph is
 * preserved.
 */
function rewriteParagraph(doc: any, p: any, newText: string) {
  // Walk children, drop only text-bearing runs (not pPr, not drawing runs).
  const toRemove: any[] = [];
  for (let i = 0; i < p.childNodes.length; i++) {
    const c = p.childNodes[i];
    if (c.nodeType !== 1) {
      toRemove.push(c);
      continue;
    }
    if (c.namespaceURI === W_NS && c.localName === "pPr") continue; // keep
    if (c.namespaceURI === W_NS && c.localName === "r") {
      if (runContainsDrawing(c)) continue; // keep image runs
      toRemove.push(c);
      continue;
    }
    // Other element types (bookmarkStart, proofErr, etc.) get dropped.
    toRemove.push(c);
  }
  for (const c of toRemove) p.removeChild(c);

  // Append the single new text run.
  const r = doc.createElementNS(W_NS, "w:r");
  const t = doc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(newText));
  r.appendChild(t);
  p.appendChild(r);
}

function applyTransform(transform: FileTransform): boolean {
  // Transforms run *after* copyAllSourceToProcessed() + convertLegacyDocs(),
  // so PROCESSED_DIR holds a .docx for every entry (legacy .doc files have
  // already been converted). Read and rewrite the processed copy in place —
  // this lets transforms target entries whose original source was a .doc,
  // which the unzip step below can't open directly.
  const processedPath = join(PROCESSED_DIR, transform.source);
  if (!existsSync(processedPath)) {
    console.error(`  ✗ processed file missing: ${transform.source}`);
    return false;
  }

  const tmpDir = join(
    "/tmp",
    `docx-transform-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -q "${processedPath}" -d "${tmpDir}"`);
    const docXmlPath = join(tmpDir, "word", "document.xml");
    const xml = readFileSync(docXmlPath, "utf8");

    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
    if (!body) throw new Error("No <w:body> in document.xml");

    const paragraphs = body.getElementsByTagNameNS(W_NS, "p");

    let applied = 0;
    for (const change of transform.changes) {
      let matched = false;
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const text = paragraphText(p);
        if (text.includes(change.find)) {
          const newText = text.split(change.find).join(change.replace);
          rewriteParagraph(doc, p, newText);
          matched = true;
          applied++;
          break;
        }
      }
      if (!matched) {
        throw new Error(
          `Find text not present in any paragraph:\n  ${change.find.slice(0, 120)}${change.find.length > 120 ? "…" : ""}`,
        );
      }
    }

    const newXml = new XMLSerializer().serializeToString(doc);
    writeFileSync(docXmlPath, newXml);

    rmSync(processedPath, { force: true });
    execSync(`cd "${tmpDir}" && zip -r -q "${processedPath}" .`);

    console.log(
      `  ✓ ${transform.source} — applied ${applied} change${applied === 1 ? "" : "s"}`,
    );
    return true;
  } catch (err: any) {
    console.error(`  ✗ ${transform.source} — ${err.message}`);
    return false;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  // `--only <substr>` applies just the transforms whose source filename matches
  // <substr>, IN PLACE on the existing processed docx — skipping the
  // copy-all + LibreOffice-convert steps. Useful for applying a single new
  // transform without re-deriving the whole corpus (which also avoids
  // re-converting legacy .doc files). The full run remains the source of truth.
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

  ensureDirs();
  if (only) {
    console.log(`--only "${only}": applying matching transforms in place (skipping copy/convert).`);
  } else {
    console.log("Copying source → processed…");
    copyAllSourceToProcessed();
    console.log("Converting legacy .doc files via LibreOffice…");
    convertLegacyDocs();
  }

  const list = only
    ? transforms.filter((t) => t.source.includes(only))
    : transforms;
  if (only && list.length === 0) {
    console.error(`No transform whose source matches "${only}".`);
    process.exit(1);
  }
  console.log(`Applying ${list.length} transform(s):`);
  let ok = 0;
  let failed = 0;
  for (const t of list) {
    if (applyTransform(t)) ok++;
    else failed++;
  }
  console.log(`\nDone. ${ok} applied, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
