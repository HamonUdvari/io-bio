import type { ParserResult, Warning } from "./types";

const CITATION_MARKER =
  "in IO BIO, Biographical Dictionary of Secretaries-General";

const HOW_TO_CITE_MARKER = "how to cite this io bio entry";

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
    authors = node.text.split(",")[0].trim();
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
