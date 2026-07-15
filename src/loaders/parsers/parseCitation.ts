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
// take everything before the marker and strip the trailing quoted title. Straight
// and curly single quotes are both handled; a stray leading quote in the source
// (the Piot typo) is preserved unchanged rather than mangled.
const TITLE_TAIL_RE = /[‘'][^‘’']*[’']\s*$/;

function extractAuthors(citationText: string): string {
  const beforeMarker = citationText.split(CITATION_MARKER)[0];
  return beforeMarker
    .replace(TITLE_TAIL_RE, "")
    .replace(/[,\s]+$/, "")
    .trim();
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
  consumed: number[];
}> {
  const warnings: Warning[] = [];
  const consumed: number[] = [];
  let authors: string | null = null;

  const citationIdx = content.findIndex(
    (c) => c?.type === "paragraph" && c.text?.includes(CITATION_MARKER),
  );
  if (citationIdx >= 0) {
    const node = content[citationIdx];
    authors = extractAuthors(node.text) || null;
    consumed.push(citationIdx);
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

  return { value: { authors, consumed }, warnings };
}
