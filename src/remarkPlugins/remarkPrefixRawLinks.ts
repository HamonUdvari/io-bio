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

  const DOWNLOAD_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|csv|epub)(?:[?#]|$)/i;

  return (tree) => {
    visit(tree, "html", (node: Html) => {
      let value = node.value;

      // Prefix internal root-absolute hrefs with the base (only when set).
      if (base) {
        value = value.replace(
          /(\shref=)(["'])(\/[^"']*)\2/gi,
          (match, pre: string, quote: string, hrefVal: string) => {
            const next = prefixHref(hrefVal);
            return next === hrefVal ? match : `${pre}${quote}${next}${quote}`;
          },
        );
      }

      // Tag file-download anchors (.pdf etc.) with `button--download` so they
      // get the trailing "↓" — mirrors rehypeAddLinkClasses, which never sees
      // these raw-HTML links. Runs regardless of base.
      value = value.replace(
        /<a\b[^>]*\bhref=(["'])([^"']*)\1[^>]*>/gi,
        (tag: string, _quote: string, href: string) => {
          if (!DOWNLOAD_RE.test(href) || /\bbutton--download\b/.test(tag)) {
            return tag;
          }
          if (/\sclass=(["']).*?\1/i.test(tag)) {
            return tag.replace(
              /(\sclass=)(["'])(.*?)\2/i,
              (_m, pre: string, q: string, cls: string) =>
                `${pre}${q}${cls} button--download${q}`,
            );
          }
          return tag.replace(/^<a\b/i, '<a class="button--download"');
        },
      );

      node.value = value;
    });
  };
};
