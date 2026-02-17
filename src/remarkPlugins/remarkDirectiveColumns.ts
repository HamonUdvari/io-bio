import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

export const remarkDirectiveColumns: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (
        node.type === "containerDirective" &&
        node.name === "columns"
      ) {
        const variant = node.attributes?.variant ?? "default";

        node.data = node.data || {};
        node.data.hName = "div"; 
        node.data.hProperties = {
          class: `columns columns--${variant}`
        };
      }
    });
  };
};
