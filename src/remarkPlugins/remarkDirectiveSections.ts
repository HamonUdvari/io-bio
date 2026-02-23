import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

export const remarkDirectiveSections: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type === "containerDirective" && node.name === "section") {
        const title = node.attributes?.title;
        const variant = node.attributes?.variant ?? "secondary";
        const stretch = node.attributes?.stretch ?? "base";

        node.data = node.data || {};
        node.data.hName = "section";
        node.data.hProperties = {
          class: `section section--${variant} section--${stretch}`,
        };

        if (title) {
          node.children.unshift({
            type: "heading",
            depth: 2,
            data: {
              hProperties: {
                className: ["section__title"],
              },
            },
            children: [{ type: "text", value: title }],
          });
        }
      }
    });
  };
};
