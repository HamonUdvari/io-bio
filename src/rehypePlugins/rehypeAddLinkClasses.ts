import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/**
 * Add fixed classes to all <a> tags.
 */
export function rehypeAddLinkClasses() {
  const classesToAdd = ["button", "button--secondary"];

  return function (tree: Root) {
    visit(tree, "element", function (node: Element) {
      if (node.tagName === "a") {
        if (!node.properties) node.properties = {};
        const existing = node.properties.className ?? [];
        const current = Array.isArray(existing)
          ? existing.map(String)
          : [String(existing)];
        node.properties.className = [...current, ...classesToAdd];
      }
    });
  };
}
