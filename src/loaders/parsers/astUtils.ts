import { h } from "hastscript";
import { toHtml } from "hast-util-to-html";

/**
 * Transform officeparser AST nodes into HAST nodes, then to HTML.
 * Lifted as-is from the original docxLoader.
 */
export function transformNode(node: any): any {
  if (node.type === "text") {
    let element: any = node.text || "";
    if (node.formatting?.bold) element = h("strong", element);
    if (node.formatting?.italic) element = h("em", element);
    if (node.formatting?.underline) element = h("u", element);
    return element;
  }

  const children = (node.children || []).map(transformNode);

  switch (node.type) {
    case "paragraph":
      return h("p", children);
    case "heading": {
      const level = node.metadata?.level || 1;
      return h(`h${level}`, children);
    }
    case "list":
      return h("li", children);
    case "table":
      return h("table", h("tbody", children));
    case "row":
      return h("tr", children);
    case "cell":
      return h("td", children);
    default:
      return children;
  }
}

export function nodesToHtml(nodes: any[]): string {
  const tree = h(null, nodes.map(transformNode));
  return toHtml(tree);
}

export function isEmptyHastNode(node: any): boolean {
  if (!node) return true;
  if (node.type === "text") return !node.value?.trim();
  if (node.type === "element")
    return !node.children || node.children.every(isEmptyHastNode);
  return false;
}
