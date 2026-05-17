import { nodesToHtml } from "./astUtils";
import type { ParserResult, Warning } from "./types";

export type APLSection = {
  html: string;
  /** Indices into the AST content array that this section consumed. */
  consumed: number[];
};

/**
 * Extract a section that begins with a labelled paragraph (e.g. "ARCHIVES",
 * "PUBLICATIONS", "LITERATURE") and continues until the next bolded paragraph.
 *
 * Mirrors the original loader logic:
 *  - locate the first paragraph whose text starts with `label`
 *  - strip the label/colon from that paragraph's children
 *  - include all following paragraphs until one with a bold first child
 */
export function extractSectionNodes(
  content: any[],
  label: string,
): { nodes: any[]; consumed: number[] } {
  const startIndex = content.findIndex(
    (n) => n?.type === "paragraph" && n.text?.startsWith(label),
  );
  if (startIndex < 0) return { nodes: [], consumed: [] };

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
  return { nodes, consumed };
}

export function parseAPL(content: any[]): ParserResult<{
  archives: string;
  publications: string;
  literature: string;
  consumed: number[];
}> {
  const warnings: Warning[] = [];

  const a = extractSectionNodes(content, "ARCHIVES");
  const p = extractSectionNodes(content, "PUBLICATIONS");
  const l = extractSectionNodes(content, "LITERATURE");

  if (a.nodes.length === 0) {
    warnings.push({
      code: "apl_archives_missing",
      field: "archives",
      message: "No ARCHIVES section found",
      severity: "info",
    });
  }
  if (p.nodes.length === 0) {
    warnings.push({
      code: "apl_publications_missing",
      field: "publications",
      message: "No PUBLICATIONS section found",
      severity: "info",
    });
  }
  if (l.nodes.length === 0) {
    warnings.push({
      code: "apl_literature_missing",
      field: "literature",
      message: "No LITERATURE section found",
      severity: "warn",
    });
  }

  const archives = a.nodes.length ? nodesToHtml(a.nodes) : "";
  const publications = p.nodes.length ? nodesToHtml(p.nodes) : "";
  const literature = l.nodes.length ? nodesToHtml(l.nodes) : "";

  return {
    value: {
      archives,
      publications,
      literature,
      consumed: [...a.consumed, ...p.consumed, ...l.consumed],
    },
    warnings,
  };
}
