import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

export interface RehypeAddLinkClassesOptions {
  /**
   * Site base path (e.g. "/io-bio"). Internal root-absolute hrefs are prefixed
   * with this so they resolve correctly under a GitHub Pages project page.
   * A base of "/" or "" is treated as a no-op (root custom-domain deploy).
   */
  base?: string;
}

/**
 * Add fixed classes to all <a> tags, and prefix internal root-absolute hrefs
 * with the configured base path.
 *
 * NOTE: this only sees anchors that exist as parsed hast `element` nodes — i.e.
 * markdown links and MDX JSX. Anchors written as *literal block HTML* inside a
 * `.md` file (e.g. `<div><a href="/x">…</a></div>`) are emitted as raw HTML and
 * never reach this rehype stage; those are handled by the companion remark
 * plugin `remarkPrefixRawLinks` at the mdast stage.
 *
 * Prefixing is skipped for:
 *  - external links (http:, https:, mailto:, tel:, etc.)
 *  - protocol-relative links ("//host/path")
 *  - hrefs that are not root-absolute (don't start with "/")
 *  - hrefs already starting with the base (idempotent / pre-prefixed)
 */
export function rehypeAddLinkClasses(options: RehypeAddLinkClassesOptions = {}) {
  // Auto "standalone link → button" styling is disabled for now (client): the
  // design doesn't use the button-format link, so this list and the block that
  // applies it (below) are commented out. Links stay plain; download lists keep
  // their CSS down-arrow. Re-enable both to restore CTA buttons.
  // const classesToAdd = ["button", "button--secondary"];

  // Normalise the base: strip a trailing slash so joins are predictable.
  // "/io-bio/" → "/io-bio"; "/" or "" → "" (no-op).
  const rawBase = options.base ?? "";
  const base = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

  return function (tree: Root) {
    visit(
      tree,
      "element",
      function (node: Element, _index: number | undefined, parent: any) {
        if (node.tagName !== "a") return;

        if (!node.properties) node.properties = {};

        const href =
          typeof node.properties.href === "string" ? node.properties.href : "";

        // --- prefix internal root-absolute hrefs with the base (all links) ---
        if (base && href && !href.startsWith("#")) {
          const isProtocolRelative = href.startsWith("//");
          const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(href);
          const isRootAbsolute = href.startsWith("/") && !isProtocolRelative;
          const alreadyPrefixed =
            href === base || href.startsWith(base + "/");
          if (isRootAbsolute && !hasScheme && !alreadyPrefixed) {
            node.properties.href = base + href;
          }
        }

        // In-page anchor links (TOC / jump links) stay plain.
        if (href.startsWith("#")) return;

        /* DISABLED for now (client) — no button-format links; see note above.
           Re-enable this block (and classesToAdd) to make standalone links
           (download CTAs) render as buttons.
        // Only "standalone" links — the sole significant child of a block
        // element (a deliberate CTA, e.g. a download or "read the…") — become
        // buttons. Inline prose links stay plain (normal underlined links).
        const blockParent =
          parent &&
          parent.type === "element" &&
          ["p", "li", "div"].includes(parent.tagName);
        const significant = blockParent
          ? parent.children.filter(
              (c: any) => !(c.type === "text" && /^\s*$/.test(c.value)),
            )
          : [];
        if (!(significant.length === 1 && significant[0] === node)) return;

        // --- add classes (+ a download arrow for file-download links) ---
        const existing = node.properties.className ?? [];
        const current = Array.isArray(existing)
          ? existing.map(String)
          : [String(existing)];
        const classes = [...classesToAdd];
        if (/\.(pdf|docx?|xlsx?|pptx?|zip|csv|epub)(?:[?#]|$)/i.test(href)) {
          classes.push("button--download");
        }
        node.properties.className = [...current, ...classes];
        */
      },
    );
  };
}
