import type { Plugin } from "unified";
import type { Root, Heading } from "mdast";

export const remarkDemoteHeadings: Plugin<[], Root> = () => {
  return (tree) => {
    for (const node of tree.children) {
      if (node.type === "heading") {
        const heading = node as Heading;
        // increment depth by 1, max 6
        heading.depth = Math.min(heading.depth + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      }
    }
  };
};
