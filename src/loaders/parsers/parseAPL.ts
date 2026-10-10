import type { APLSectionData, Citation, ParserResult, Warning } from "./types";

/** A paragraph's first non-blank text run (image and blank runs skipped). */
function firstTextRun(node: any): any {
  return node?.children?.find(
    (c: any) =>
      c?.type === "text" && typeof c.text === "string" && c.text.trim() !== "",
  );
}

/**
 * Locate a labelled section in the AST content (e.g. "ARCHIVES", "PUBLICATIONS",
 * "LITERATURE") and return:
 *  - the head node + continuation nodes (paragraphs until the next bold one)
 *  - the indices in `content` that were consumed
 *  - the *plain text* concatenation of the section body, with the leading
 *    "LABEL: " or "LABEL" stripped.
 */
export function extractSectionNodes(
  content: any[],
  label: string,
): { nodes: any[]; consumed: number[]; rawText: string } {
  const startIndex = content.findIndex(
    (n) => n?.type === "paragraph" && n.text?.startsWith(label),
  );
  if (startIndex < 0) return { nodes: [], consumed: [], rawText: "" };

  const head = content[startIndex];
  head.children = head.children.filter((cn: any) => {
    const t = typeof cn.text === "string" ? cn.text.trim() : cn.text;
    return t !== label && t !== ":";
  });

  const nodes: any[] = [head];
  const consumed: number[] = [startIndex];
  for (let i = startIndex + 1; i < content.length; i++) {
    const node = content[i];
    // A paragraph that opens with bold text is the next labelled section. Judge
    // by its first non-blank text run: Sadik-IN 2026.docx opens LITERATURE with
    // three ink drawings (six image runs).
    if (firstTextRun(node)?.formatting?.bold) break;
    nodes.push(node);
    consumed.push(i);
  }

  // Build the raw text: head text minus the label prefix, then continuation
  // paragraphs concatenated with a single space.
  const headText = (head.text ?? "")
    .replace(new RegExp(`^${label}\\s*:?\\s*`), "")
    .trim();
  const rest = nodes
    .slice(1)
    .map((n) => (n?.text ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const rawText = rest ? `${headText} ${rest}` : headText;

  return { nodes, consumed, rawText };
}

// Item separator: `;` followed by whitespace (or end-of-text). The whitespace
// requirement avoids splitting URLs that contain `;` (RFC 3986 allows
// semicolons in path/query — e.g. ".../;search?q=foo").
const ITEM_SEPARATOR_RE = /;(?:\s+|$)/;

// A "simple" bracketed note: "(…)" or "[…]" with no other bracket inside.
const SIMPLE_BRACKETS_RE = /\([^()[\]]*\)|\[[^()[\]]*\]/g;

const QUOTE_OPEN = "‘";
const QUOTE_CLOSE = "’";

/**
 * Positions of the `;`s inside a quoted title ‘…’, which stay in their item.
 * A title ends at the first ’ that is not inside a nested “…” and has no
 * letter or digit after it ("Don’t" and "UNHCR’s" don't end it). Another ‘ or
 * any bracket before that means no title, so an unclosed ‘ can't swallow the
 * next works. An unbalanced “” never ends (conservative).
 */
function quotedTitleSemicolons(text: string): number[] {
  const found: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== QUOTE_OPEN) continue;
    let doubleDepth = 0;
    const semicolons: number[] = [];
    for (let j = i + 1; j < text.length; j++) {
      const ch = text[j];
      if (ch === QUOTE_OPEN || "()[]".includes(ch)) break;
      if (ch === "“") doubleDepth++;
      else if (ch === "”") doubleDepth--;
      else if (ch === ";") semicolons.push(j);
      else if (
        ch === QUOTE_CLOSE &&
        doubleDepth === 0 &&
        !/[\p{L}\p{N}]/u.test(text[j + 1] ?? "")
      ) {
        found.push(...semicolons);
        i = j;
        break;
      }
    }
  }
  return found;
}

/**
 * Split a section's text at ITEM_SEPARATOR_RE, except for a `;` inside a
 * simple bracketed note or a quoted title, so it stays in its item:
 * "Brev, Oslo 1961-1971 (5 volumes: 1882-1895; 1896-1905)" is one item, and so
 * is "‘Cole of New York Heads Atom Group; 2-Month Deadlock Is Broken …’ in The
 * New York Times, 2 April 1953, 14" (quotedTitleSemicolons).
 *
 * Deliberately conservative, because the brackets come from hand-typed Word
 * text: a `;` inside nested or mismatched brackets still splits, and if the
 * section's brackets don't balance (a stray ")" or an unclosed "(", which a few
 * source docs have) the whole text keeps the plain split, i.e. the previous
 * behaviour. Known limits (the works between become one item; no text is
 * lost): a forgotten ")" followed later in the same section by a stray ")",
 * with no other bracket in between, balances and so reads as one note; and a
 * forgotten ’ followed later by a plural possessive ("Peoples’ Bank"), with no
 * other ‘ or bracket in between, reads as the end of the title.
 */
export function splitAPLText(text: string): string[] {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && --depth < 0) break;
  }
  if (depth !== 0) return text.split(ITEM_SEPARATOR_RE);

  const keep = new Set<number>();
  for (const m of text.matchAll(SIMPLE_BRACKETS_RE))
    for (let i = m.index; i < m.index + m[0].length; i++)
      if (text[i] === ";") keep.add(i);
  for (const i of quotedTitleSemicolons(text)) keep.add(i);

  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (
      text[i] === ";" &&
      !keep.has(i) &&
      (i + 1 === text.length || /\s/.test(text[i + 1]))
    ) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const WEBSITES_ACCESSED_RE = /\(\s*all\s+websites\s+accessed\s+([^)]+)\)\s*\.?\s*$/i;

// Other wordings of that closing note, e.g. "[all accessed 15 June 2011]",
// "(all websites visited at 29 August 2025)", "(all websites approached on
// 20 July 2026)": a final simple bracketed note that says "all websites" or
// "all accessed / visited / approached" and names one of those verbs. Shown as
// written. A note without it ("(website accessed on …)") belongs to its own
// item and stays there.
const FINAL_NOTE_RE = /(\([^()[\]]*\)|\[[^()[\]]*\])\s*\.?\s*$/;
const WEBSITES_VERB_RE = /\b(?:accessed|visited|approached)\b/i;
const ALL_RE = /\ball\s+(?:websites?|accessed|visited|approached)\b/i;

/**
 * Split a section's raw text into Citation items.
 *
 *  - Pulls off an "(all websites accessed ...)" trailing footer if present,
 *    or another wording of it, kept as written (websitesNote).
 *  - Splits at `;` + whitespace — the format the Author Instructions specify
 *    for citations — but not inside brackets or quoted titles (splitAPLText).
 *  - Trims each piece, discards empties.
 */
export function parseAPLItems(rawText: string): APLSectionData {
  if (!rawText) return { items: [] };

  let text = rawText.trim();
  let websitesAccessedOn: string | undefined;
  let websitesNote: string | undefined;

  const websitesMatch = text.match(WEBSITES_ACCESSED_RE);
  const noteMatch = websitesMatch ? null : text.match(FINAL_NOTE_RE);
  if (websitesMatch) {
    websitesAccessedOn = websitesMatch[1].trim();
    text = text.substring(0, websitesMatch.index ?? text.length).trim();
  } else if (
    noteMatch &&
    WEBSITES_VERB_RE.test(noteMatch[1]) &&
    ALL_RE.test(noteMatch[1])
  ) {
    websitesNote = noteMatch[1];
    text = text.substring(0, noteMatch.index ?? text.length).trim();
  }

  const items: Citation[] = splitAPLText(text)
    .map((s) => s.trim().replace(/[.,;]+$/, "").trim())
    .filter((s) => s.length > 0)
    .map((raw) => ({ raw }));

  const result: APLSectionData = { items };
  if (websitesAccessedOn) result.websitesAccessedOn = websitesAccessedOn;
  if (websitesNote) result.websitesNote = websitesNote;
  return result;
}

export function parseAPL(content: any[]): ParserResult<{
  archives: APLSectionData;
  publications: APLSectionData;
  literature: APLSectionData;
  consumed: number[];
}> {
  const warnings: Warning[] = [];

  const a = extractSectionNodes(content, "ARCHIVES");
  const p = extractSectionNodes(content, "PUBLICATIONS");
  const l = extractSectionNodes(content, "LITERATURE");

  if (a.consumed.length === 0) {
    warnings.push({
      code: "apl_archives_missing",
      field: "archives",
      message: "No ARCHIVES section found",
      severity: "info",
    });
  }
  if (p.consumed.length === 0) {
    warnings.push({
      code: "apl_publications_missing",
      field: "publications",
      message: "No PUBLICATIONS section found",
      severity: "info",
    });
  }
  if (l.consumed.length === 0) {
    warnings.push({
      code: "apl_literature_missing",
      field: "literature",
      message: "No LITERATURE section found",
      severity: "warn",
    });
  }

  return {
    value: {
      archives: parseAPLItems(a.rawText),
      publications: parseAPLItems(p.rawText),
      literature: parseAPLItems(l.rawText),
      consumed: [...a.consumed, ...p.consumed, ...l.consumed],
    },
    warnings,
  };
}
