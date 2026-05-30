// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import preact from "@astrojs/preact";

import remarkDirective from "remark-directive";
import { remarkDemoteHeadings } from "./src/remarkPlugins/remarkDemoteHeadings";
import { rehypeAddLinkClasses } from "./src/rehypePlugins/rehypeAddLinkClasses";
import { remarkDirectiveSections } from "./src/remarkPlugins/remarkDirectiveSections";
import { remarkDirectiveColumns } from "./src/remarkPlugins/remarkDirectiveColumns";
import { remarkPrefixRawLinks } from "./src/remarkPlugins/remarkPrefixRawLinks";

import mdx from "@astrojs/mdx";

// Force `font-display: block` on every @font-face. Fontsource bakes in
// `font-display: swap`, which briefly paints Roboto / Roboto Condensed text in a
// fallback font (the visible flash) before the webfont loads. This is a
// design-led project — the correct typeface matters more than a few ms of FOIT —
// so we block the glyph slot until the real font paints, matching the
// self-declared Material Symbols face in global.css (already `block`).
//
// Done as a pipeline rewrite rather than self-hosting Fontsource's ~25 subset
// @font-face rules by hand: this preserves every subset + unicode-range (latin,
// latin-ext, greek, cyrillic, vietnamese, …) automatically, so diacritics in
// names (Hammarskjöld, Pérez de Cuéllar, …) never fall back to a system font.
function fontDisplayBlock() {
  const flip = (css) =>
    css.replace(/font-display\s*:\s*swap/gi, "font-display:block");
  return {
    name: "font-display-block",
    enforce: "post",
    // dev + most build cases: rewrite as each CSS module passes through.
    transform(code, id) {
      if (!/\.css(\?|$)/.test(id) || !code.includes("font-display")) return null;
      const out = flip(code);
      return out === code ? null : { code: out, map: null };
    },
    // build safety net: rewrite the final emitted CSS assets, after Tailwind has
    // inlined the Fontsource @imports and Vite has hashed the font URLs.
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (
          file.type === "asset" &&
          file.fileName.endsWith(".css") &&
          typeof file.source === "string"
        ) {
          file.source = flip(file.source);
        }
      }
    },
  };
}

// --- Deployment target — SINGLE SOURCE OF TRUTH for the base path ---
// TESTING (current): GitHub Pages project page → https://hamonudvari.github.io/io-bio
//   BASE = "/io-bio", site = "https://HamonUdvari.github.io".
// PRODUCTION (custom domain, once DNS is ready): switch in ONE place ↓
//   1. set `const BASE = "/";`
//   2. swap the `site` line to `site: "https://io-bio.graduateinstitute.ch"`
//   3. add a `public/CNAME` file containing `io-bio.graduateinstitute.ch`.
// Everything else (links, assets, the rehype prefixer) derives from BASE.
const BASE = "/io-bio";

// https://astro.build/config
export default defineConfig({
  site: "https://HamonUdvari.github.io",
  // site: "https://io-bio.graduateinstitute.ch",
  base: BASE,
  markdown: {
    remarkPlugins: [
      remarkDemoteHeadings,
      remarkDirective,
      remarkDirectiveColumns,
      remarkDirectiveSections,
      [remarkPrefixRawLinks, { base: BASE }],
    ],
    rehypePlugins: [[rehypeAddLinkClasses, { base: BASE }]],
  },
  server: {
    allowedHosts: true,
  },
  integrations: [preact({ compat: true }), mdx()],
  vite: {
    plugins: [tailwindcss(), fontDisplayBlock()],
    resolve: {
      alias: {
        "@components": "/src/components",
        "@content": "/src/content",
        "@layouts": "/src/layouts",
        "@styles": "/src/styles",
        "@utils": "/src/utils",
      },
    },
  },
});
