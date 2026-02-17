// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import preact from "@astrojs/preact";

import remarkDirective from "remark-directive";
import { remarkDemoteHeadings } from "./src/remarkPlugins/remarkDemoteHeadings";
import { rehypeAddLinkClasses } from "./src/rehypePlugins/rehypeAddLinkClasses";
import { remarkDirectiveSections } from "./src/remarkPlugins/remarkDirectiveSections";
import { remarkDirectiveColumns } from "./src/remarkPlugins/remarkDirectiveColumns";

import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://io-bio.graduateinstitute.ch",
  markdown: {
    remarkPlugins: [
      remarkDemoteHeadings,
      remarkDirective,
      remarkDirectiveColumns,
      remarkDirectiveSections,
    ],
    rehypePlugins: [rehypeAddLinkClasses],
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
