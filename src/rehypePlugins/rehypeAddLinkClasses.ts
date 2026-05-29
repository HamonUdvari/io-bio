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
  const classesToAdd = ["button", "button--secondary"];

  // Normalise the base: strip a trailing slash so joins are predictable.
  // "/io-bio/" → "/io-bio"; "/" or "" → "" (no-op).
  const rawBase = options.base ?? "";
  const base = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

  return function (tree: Root) {
    visit(tree, "element", function (node: Element) {
      if (node.tagName !== "a") return;

      if (!node.properties) node.properties = {};

      const href =
        typeof node.properties.href === "string" ? node.properties.href : "";

      // In-page anchor links (TOC / jump links) stay plain — not boxed buttons.
      if (href.startsWith("#")) return;

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

      // --- prefix internal root-absolute hrefs with the base ---
      if (!base || !href) return;

      const isProtocolRelative = href.startsWith("//");
      const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(href);
      const isRootAbsolute = href.startsWith("/") && !isProtocolRelative;
      const alreadyPrefixed = href === base || href.startsWith(base + "/");

      if (isRootAbsolute && !hasScheme && !alreadyPrefixed) {
        node.properties.href = base + href;
      }
    });
  };
}
