import type { ParserResult, Warning } from "./types";

// Matched leniently: the full title tail ("…of Secretaries-General…") is dropped
// on purpose because some source docs mis-hyphenate it ("Secretaries- General"),
// which would otherwise make the citation — and thus the author — undetectable
// (e.g. the Michelmore entry rendered "By .").
const CITATION_MARKER = "in IO BIO, Biographical Dictionary";

const HOW_TO_CITE_MARKER = "how to cite this io bio entry";

// The citation reads:  AUTHORS, 'LASTNAME, Firstname' in IO BIO, Biographical …
// Authors = the text before the quoted entry title. The old behaviour split on the
// first comma, which dropped co-authors and the "Jr." suffix because the title
// itself contains a comma (e.g. Lie lost "Jr. and Ellen Jenny Ravndal"). Instead,
// take everything before the marker and strip the trailing quoted title.
//
// The title's content class excludes ONLY the opening curly quote (U+2018), not the
// closing one (U+2019) — because U+2019 doubles as the apostrophe inside names like
// "M'Bow", so excluding it would stop the match short and leak the title into the
// author. Anchoring on the last opening quote also leaves a stray leading quote in
// the source (the Piot typo) untouched rather than mangled.
const TITLE_TAIL_RE = /[‘'][^‘]*[’']\s*$/;

function extractAuthors(citationText: string): string {
  const beforeMarker = citationText.split(CITATION_MARKER)[0];
  return beforeMarker
    .replace(TITLE_TAIL_RE, "")
    .replace(/[,\s]+$/, "")
    .trim();
}

// The citation tail reads: "… Edited by <EDITORS>, www.ru.nl/fm/iobio, Accessed …".
// Capture just <EDITORS>, stopping at the trailing URL / "Accessed" / end. Every
// source doc carries this, so each entry can now show its OWN editors (older
// entries keep the three-editor wording; newer ones may differ / use "et al.").
const EDITED_BY_RE = /,\s*Edited by\s+(.+?)(?:,\s*www\.|,\s*Accessed\b|$)/i;

// Known-editor OCR fixes. The source docs are scanned/retyped, so the one
// recurring typo is the middle initial in "Jaci L. Eisenberg" — seen as
// "Jaci Eisenberg", "Jaci L.Eisenberg", "Jaci . Eisenberg", "Jaci L.  Eisenberg".
// Canonicalise just that name; every other name passes through untouched, so a
// genuinely different future editor is never rewritten.
const EDITOR_NAME_FIXES: Array<[RegExp, string]> = [
  [/Jaci\s*(?:L\s*\.?|\.)?\s*Eisenberg/gi, "Jaci L. Eisenberg"],
];

function normalizeEditors(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim().replace(/[,\s]+$/, "");
  for (const [re, canon] of EDITOR_NAME_FIXES) s = s.replace(re, canon);
  return s;
}

function extractEditors(citationText: string): string | null {
  const m = citationText.match(EDITED_BY_RE);
  if (!m) return null;
  return normalizeEditors(m[1]) || null;
}

/**
 * Find the citation paragraph (which contains the author name) and any
 * companion "How to cite this IO BIO entry" paragraph + standalone author
 * paragraph. Each is reported as consumed so the body excludes them.
 *
 * Mirrors the original loader's behaviour: even when no citation paragraph
 * exists, the "How to cite" header is still consumed if present.
 */
export function parseCitation(content: any[]): ParserResult<{
  authors: string | null;
  editors: string | null;
  consumed: number[];
}> {
  const warnings: Warning[] = [];
  const consumed: number[] = [];
  let authors: string | null = null;
  let editors: string | null = null;

  const citationIdx = content.findIndex(
    (c) => c?.type === "paragraph" && c.text?.includes(CITATION_MARKER),
  );
  if (citationIdx >= 0) {
    const node = content[citationIdx];
    authors = extractAuthors(node.text) || null;
    editors = extractEditors(node.text);
    consumed.push(citationIdx);
    if (!editors) {
      warnings.push({
        code: "editors_missing",
        field: "editors",
        message: `Citation paragraph has no "Edited by …" segment`,
        severity: "info",
      });
    }
  } else {
    warnings.push({
      code: "citation_missing",
      field: "authors",
      message: `No citation paragraph found (expected text containing "${CITATION_MARKER}")`,
      severity: "warn",
    });
  }

  const howToIdx = content.findIndex(
    (c) =>
      c?.type === "paragraph" &&
      c.text?.toLowerCase().includes(HOW_TO_CITE_MARKER),
  );
  if (howToIdx >= 0 && !consumed.includes(howToIdx)) consumed.push(howToIdx);

  if (authors) {
    const authorIdx = content.findIndex(
      (c) =>
        c?.type === "paragraph" &&
        typeof c.text === "string" &&
        c.text.toLowerCase().includes(authors!.toLowerCase()),
    );
    if (authorIdx >= 0 && !consumed.includes(authorIdx))
      consumed.push(authorIdx);
  }

  return { value: { authors, editors, consumed }, warnings };
}
