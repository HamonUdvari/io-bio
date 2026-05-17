import type { APLSectionData, Citation, ParserResult, Warning } from "./types";

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
    if (node?.children?.[0]?.formatting?.bold) break;
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

const WEBSITES_ACCESSED_RE = /\(\s*all\s+websites\s+accessed\s+([^)]+)\)\s*\.?\s*$/i;

/**
 * Split a section's raw text into Citation items.
 *
 *  - Pulls off an "(all websites accessed ...)" trailing footer if present.
 *  - Splits on ` ; ` (semicolons surrounded by whitespace) — the format the
 *    Author Instructions specify for citations.
 *  - Trims each piece, discards empties.
 */
export function parseAPLItems(rawText: string): APLSectionData {
  if (!rawText) return { items: [] };

  let text = rawText.trim();
  let websitesAccessedOn: string | undefined;

  const websitesMatch = text.match(WEBSITES_ACCESSED_RE);
  if (websitesMatch) {
    websitesAccessedOn = websitesMatch[1].trim();
    text = text.substring(0, websitesMatch.index ?? text.length).trim();
  }

  // Items are separated by `;` followed by whitespace (or end-of-text). The
  // whitespace requirement avoids splitting URLs that contain `;` (RFC 3986
  // allows semicolons in path/query — e.g. ".../;search?q=foo").
  const items: Citation[] = text
    .split(/;(?:\s+|$)/)
    .map((s) => s.trim().replace(/[.,;]+$/, "").trim())
    .filter((s) => s.length > 0)
    .map((raw) => ({ raw }));

  const result: APLSectionData = { items };
  if (websitesAccessedOn) result.websitesAccessedOn = websitesAccessedOn;
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
