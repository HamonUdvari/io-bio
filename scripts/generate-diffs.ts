#!/usr/bin/env node
/**
 * For each entry in the transforms registry, produce two outputs in
 * `src/content/bios-diffs/`:
 *
 *   1. `<source-basename>.diff.md` — a human-readable markdown summary of
 *      every change applied to that file, with the `reason` from the registry.
 *      Reviewable in a code editor, copy-pasteable into an email.
 *
 *   2. `<source-basename> (track-changes).docx` — a copy of the source docx
 *      with Word "Track Changes" markers wrapping every modified paragraph.
 *      Open in Word: the original paragraph appears strikethrough; the
 *      replacement appears inserted. The author can Accept/Reject.
 *
 * Track-change granularity is paragraph-level (whole matched paragraph
 * deleted + a new one inserted). It's heavier than character-level diffs but
 * mechanically simple and conveys the intent clearly.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
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
const DIFFS_DIR = join(ROOT, "src/content/bios-diffs");

const AUTHOR = "IO BIO parser";
const NOW = new Date().toISOString().replace(/\.\d+Z$/, "Z");

function ensureDirs() {
  if (!existsSync(SOURCE_DIR))
    throw new Error(`Missing source dir: ${SOURCE_DIR}`);
  mkdirSync(DIFFS_DIR, { recursive: true });
}

function baseName(filename: string): string {
  return filename.replace(/\.docx?$/i, "");
}

// -------- Markdown diff --------

function writeMarkdownDiff(transform: FileTransform) {
  const md: string[] = [];
  md.push(`# Suggested changes to ${transform.source}`);
  md.push("");
  md.push(
    `Generated automatically so the IO BIO parser can extract this entry. ` +
      `${transform.changes.length} change${transform.changes.length === 1 ? "" : "s"} applied.`,
  );
  md.push("");
  for (let i = 0; i < transform.changes.length; i++) {
    const c = transform.changes[i];
    md.push(`## ${i + 1}. ${c.reason}`);
    md.push("");
    md.push("**Original text:**");
    md.push("");
    md.push("> " + c.find.replace(/\n/g, "\n> "));
    md.push("");
    md.push("**Suggested text:**");
    md.push("");
    md.push("> " + c.replace.replace(/\n/g, "\n> "));
    md.push("");
  }
  const out = join(DIFFS_DIR, `${baseName(transform.source)}.diff.md`);
  writeFileSync(out, md.join("\n"));
  console.log(`  ✓ ${out.replace(ROOT + "/", "")}`);
}

// -------- Track-changes docx --------

function paragraphText(p: any): string {
  let out = "";
  const runs = p.getElementsByTagNameNS(W_NS, "r");
  for (let i = 0; i < runs.length; i++) {
    const ts = runs[i].getElementsByTagNameNS(W_NS, "t");
    for (let j = 0; j < ts.length; j++) out += ts[j].textContent ?? "";
  }
  return out;
}

/**
 * Wrap every existing <w:r> in the paragraph in a <w:del>, converting each
 * <w:t> to <w:delText>. Returns the deletion-wrapped runs (so they can stay
 * in place inside the paragraph) and adds an <w:ins> with the replacement.
 */
function applyTrackedChange(
  doc: any,
  p: any,
  oldText: string,
  newText: string,
  reason: string,
  id: number,
) {
  // 1. Collect existing runs (skip <w:pPr>).
  const runs: any[] = [];
  for (let i = 0; i < p.childNodes.length; i++) {
    const c = p.childNodes[i];
    if (
      c.nodeType === 1 &&
      c.namespaceURI === W_NS &&
      c.localName === "r"
    ) {
      runs.push(c);
    }
  }

  // 2. Convert each <w:t> inside the runs to <w:delText>.
  for (const r of runs) {
    const ts = Array.from(
      r.getElementsByTagNameNS(W_NS, "t") as any,
    ) as any[];
    for (const t of ts) {
      const delText = doc.createElementNS(W_NS, "w:delText");
      // Preserve xml:space if present.
      const space = t.getAttribute("xml:space");
      if (space) delText.setAttribute("xml:space", space);
      else delText.setAttribute("xml:space", "preserve");
      delText.appendChild(doc.createTextNode(t.textContent ?? ""));
      t.parentNode.replaceChild(delText, t);
    }
  }

  // 3. Wrap each run in a <w:del> in place.
  for (const r of runs) {
    const del = doc.createElementNS(W_NS, "w:del");
    del.setAttribute("w:id", String(id));
    del.setAttribute("w:author", AUTHOR);
    del.setAttribute("w:date", NOW);
    p.replaceChild(del, r);
    del.appendChild(r);
  }

  // 4. Append a <w:ins> with the new text as a single run.
  const ins = doc.createElementNS(W_NS, "w:ins");
  ins.setAttribute("w:id", String(id + 1));
  ins.setAttribute("w:author", AUTHOR);
  ins.setAttribute("w:date", NOW);
  const newRun = doc.createElementNS(W_NS, "w:r");
  const newT = doc.createElementNS(W_NS, "w:t");
  newT.setAttribute("xml:space", "preserve");
  newT.appendChild(doc.createTextNode(newText));
  newRun.appendChild(newT);
  ins.appendChild(newRun);
  p.appendChild(ins);
}

function writeTrackChangesDocx(transform: FileTransform) {
  const sourcePath = join(SOURCE_DIR, transform.source);
  const outPath = join(
    DIFFS_DIR,
    `${baseName(transform.source)} (track-changes).docx`,
  );
  const tmpDir = join(
    "/tmp",
    `track-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -q "${sourcePath}" -d "${tmpDir}"`);
    const docXmlPath = join(tmpDir, "word", "document.xml");
    const xml = readFileSync(docXmlPath, "utf8");
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
    const paragraphs = body.getElementsByTagNameNS(W_NS, "p");

    let nextId = 1000;
    for (const change of transform.changes) {
      let matched = false;
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const text = paragraphText(p);
        if (text.includes(change.find)) {
          const newText = text.split(change.find).join(change.replace);
          applyTrackedChange(doc, p, text, newText, change.reason, nextId);
          nextId += 2;
          matched = true;
          break;
        }
      }
      if (!matched) {
        throw new Error(
          `Find text not present in any paragraph for track-changes: ${change.find.slice(0, 80)}…`,
        );
      }
    }

    const newXml = new XMLSerializer().serializeToString(doc);
    writeFileSync(docXmlPath, newXml);

    rmSync(outPath, { force: true });
    execSync(`cd "${tmpDir}" && zip -r -q "${outPath}" .`);
    console.log(`  ✓ ${outPath.replace(ROOT + "/", "")}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeChangelog() {
  const md: string[] = [];
  md.push("# bios-processed CHANGELOG");
  md.push("");
  md.push(
    `Every cosmetic edit applied to ` +
      `\`src/content/bios-source/\` to produce \`src/content/bios-processed/\`. ` +
      `Generated automatically by \`npm run bios:diff\`.`,
  );
  md.push("");
  md.push(`Files modified: **${transforms.length}**.`);
  md.push("");
  for (const t of transforms) {
    md.push(`## \`${t.source}\``);
    md.push("");
    md.push(`See [${baseName(t.source)}.diff.md](./${baseName(t.source)}.diff.md).`);
    md.push("");
    for (let i = 0; i < t.changes.length; i++) {
      const c = t.changes[i];
      md.push(`${i + 1}. ${c.reason}`);
      md.push("");
      md.push(`   - Before: \`${c.find.slice(0, 140)}${c.find.length > 140 ? "…" : ""}\``);
      md.push(`   - After:  \`${c.replace.slice(0, 140)}${c.replace.length > 140 ? "…" : ""}\``);
      md.push("");
    }
  }
  const out = join(DIFFS_DIR, `CHANGELOG.md`);
  writeFileSync(out, md.join("\n"));
  console.log(`  ✓ ${out.replace(ROOT + "/", "")}`);
}

function main() {
  ensureDirs();
  console.log("Generating diffs:");
  for (const t of transforms) {
    writeMarkdownDiff(t);
    writeTrackChangesDocx(t);
  }
  writeChangelog();
  console.log(`\nDone. ${transforms.length} file(s) processed.`);
}

main();
