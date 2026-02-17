import type { Plugin } from "unified";
import type { Root, Heading } from "mdast";
import { visit } from "unist-util-visit";

export const remarkDemoteHeadings: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type === "heading") {
        node.depth = Math.min(node.depth + 1, 6);
      }
    });
  };
};
