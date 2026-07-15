import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

// `:::people` container directive — the editorial-team list. Renders with the
// same `columns columns--primary` markup/styling as before (name at heading
// scale, affiliation + role stacked and muted on the next line), but as its own
// directive so the CMS can offer a *structured* "Editorial member" block
// (Name / Affiliation / Role fields) instead of hand-typed `:muted[…]`.
// Content stays plain Markdown — `* Name :muted[Affiliation (Role)]` — so the
// site renders it exactly as the old `:::columns{variant="primary"}` did.
export const remarkDirectivePeople: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type === "containerDirective" && node.name === "people") {
        node.data = node.data || {};
        node.data.hName = "div";
        node.data.hProperties = {
          class: "columns columns--primary",
        };
      }
    });
  };
};
