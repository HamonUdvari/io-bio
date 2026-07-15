import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

// `:::contributors` container directive — the "Our Contributors" list. Renders
// with the same `columns columns--compact` markup/styling as before (a
// multi-column list, each item "Name (muted entries)"), but as its own
// directive so the CMS can offer a *structured* "Contributor" block
// (Name / Entries fields) instead of hand-typed `:muted[…]`. Content stays plain
// Markdown — `* Name :muted[(ENTRIES)]` — so the site renders it exactly as the
// old `:::columns{variant="compact"}` did, with the entries de-emphasised.
export const remarkDirectiveContributors: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type === "containerDirective" && node.name === "contributors") {
        node.data = node.data || {};
        node.data.hName = "div";
        node.data.hProperties = {
          class: "columns columns--compact",
        };
      }
    });
  };
};
