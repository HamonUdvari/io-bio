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

/**
 * Replace `pText` (the paragraph's concatenated text) with `newText` by
 * collapsing all of the paragraph's existing runs into a single text run.
 * Preserves the paragraph's `<w:pPr>` (properties) child if it has one.
 */
function rewriteParagraph(doc: any, p: any, newText: string) {
  // Remove every child that isn't <w:pPr>.
  const toRemove: any[] = [];
  for (let i = 0; i < p.childNodes.length; i++) {
    const c = p.childNodes[i];
    if (c.nodeType === 1 /* Element */) {
      if (!(c.namespaceURI === W_NS && c.localName === "pPr")) toRemove.push(c);
    } else {
      toRemove.push(c);
    }
  }
  for (const c of toRemove) p.removeChild(c);

  // Append a single <w:r><w:t xml:space="preserve">...</w:t></w:r>.
  const r = doc.createElementNS(W_NS, "w:r");
  const t = doc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(newText));
  r.appendChild(t);
  p.appendChild(r);
}

function applyTransform(transform: FileTransform): boolean {
  const sourcePath = join(SOURCE_DIR, transform.source);
  const processedPath = join(PROCESSED_DIR, transform.source);
  if (!existsSync(sourcePath)) {
    console.error(`  ✗ source missing: ${transform.source}`);
    return false;
  }

  const tmpDir = join(
    "/tmp",
    `docx-transform-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -q "${sourcePath}" -d "${tmpDir}"`);
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
  ensureDirs();
  console.log("Copying source → processed…");
  copyAllSourceToProcessed();
  console.log(`Applying ${transforms.length} transform(s):`);
  let ok = 0;
  let failed = 0;
  for (const t of transforms) {
    if (applyTransform(t)) ok++;
    else failed++;
  }
  console.log(`\nDone. ${ok} applied, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
