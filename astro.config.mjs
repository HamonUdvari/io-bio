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
    plugins: [tailwindcss()],
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
