import type { Plugin } from "unified";
import type { Root, Html } from "mdast";
import { visit } from "unist-util-visit";

export interface RemarkPrefixRawLinksOptions {
  /**
   * Site base path (e.g. "/io-bio"). Internal root-absolute hrefs found in
   * literal HTML are prefixed with this. A base of "/" or "" is a no-op.
   */
  base?: string;
}

/**
 * Prefix internal root-absolute `href="/..."` attributes inside *literal block
 * HTML* in markdown (mdast `html` nodes) with the configured base path.
 *
 * Astro's markdown pipeline does not surface this raw HTML to the rehype stage,
 * so href-prefixing for content like `<div><a href="/introduction">…</a></div>`
 * and the PDF download buttons in author-instructions.md must happen here, on
 * the mdast tree, where the HTML is still a visitable `html` node.
 *
 * Skips external (scheme:), protocol-relative (//), non-root-absolute, and
 * already-prefixed hrefs. Mirrors the logic in rehypeAddLinkClasses.
 */
export const remarkPrefixRawLinks: Plugin<
  [RemarkPrefixRawLinksOptions?],
  Root
> = (options = {}) => {
  const rawBase = options.base ?? "";
  const base = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

  function prefixHref(href: string): string {
    const isProtocolRelative = href.startsWith("//");
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(href);
    const isRootAbsolute = href.startsWith("/") && !isProtocolRelative;
    const alreadyPrefixed = href === base || href.startsWith(base + "/");
    if (isRootAbsolute && !hasScheme && !alreadyPrefixed) {
      return base + href;
    }
    return href;
  }

  return (tree) => {
    visit(tree, "html", (node: Html) => {
      // Prefix internal root-absolute hrefs with the base (only when set).
      // (We deliberately do NOT add download-button classes here — raw-HTML
      // file links render as plain links, e.g. the author-instructions
      // Downloads list. Markdown links that should look like download buttons
      // are still handled by rehypeAddLinkClasses.)
      if (!base) return;
      node.value = node.value.replace(
        /(\shref=)(["'])(\/[^"']*)\2/gi,
        (match, pre: string, quote: string, hrefVal: string) => {
          const next = prefixHref(hrefVal);
          return next === hrefVal ? match : `${pre}${quote}${next}${quote}`;
        },
      );
    });
  };
};
