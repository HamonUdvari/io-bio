import type { Plugin } from "unified";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

// Inline `:muted[…]` text directive → <span class="muted">…</span>.
//
// Lets an editor mark the *secondary* part of a line so it renders
// de-emphasised — an affiliation ("Bob Reinalda, :muted[Radboud University]")
// or the entries a contributor wrote ("Chloé Maurel :muted[(ANNAN, EVANS)]").
// Being an explicit marker (rather than an automatic rule keyed on punctuation)
// means the editor stays in control of the exceptions, e.g. a parenthetical
// that is part of a name — "Ine (C.M.) Megens :muted[(LUNS)]" — keeps "(C.M.)"
// at full strength.
export const remarkDirectiveMuted: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type === "textDirective" && node.name === "muted") {
        node.data = node.data || {};
        node.data.hName = "span";
        node.data.hProperties = {
          class: "muted",
        };
      }
    });
  };
};
