import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { docxLoader } from "./content/loaders/docxLoader.ts";

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export type Link = z.infer<typeof linkSchema>;

const imageSchema = z.object({
  type: z.string(),
  mimeType: z.string(),
  data: z.string(),
  name: z.string().optional(),
  extension: z.string(),
});

const roleSchema = z.object({
  ordinalText: z.string().optional(),
  title: z.string(),
  organisation: z.string().optional(),
  abbreviation: z.string().optional(),
  startYear: z.number().optional(),
  endYear: z.number().optional(),
});

export type Role = z.infer<typeof roleSchema>;

const citationSchema = z.object({
  raw: z.string(),
});

export type Citation = z.infer<typeof citationSchema>;

const aplSchema = z.object({
  items: z.array(citationSchema),
  websitesAccessedOn: z.string().optional(),
});

export type APLSection = z.infer<typeof aplSchema>;

export const bioDataSchema = z.object({
  title: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  knownAs: z.string().optional(),
  nee: z.string().optional(),
  summary: z.string(),
  image: imageSchema.optional(),
  imageSource: z.string().optional(),
  imageFn: z.string().optional(),
  imagePortraitFn: z.string().optional(),
  life: z.string(),
  roles: z.array(roleSchema).default([]),
  archives: aplSchema.default({ items: [] }),
  publications: aplSchema.default({ items: [] }),
  literature: aplSchema.default({ items: [] }),
  version: z.string().optional(),
  versionDoi: z.string().optional(), // version-specific Zenodo DOI for this entry, when minted
  conceptDoi: z.string().optional(), // entry concept DOI (always-latest), when minted
  // Per-entry Zenodo citation shown in "How to cite" (issue #2). docxLoader
  // builds it: a production DOI (resolves via doi.org) once minted, else the
  // sandbox deposit's concept record (sandbox.zenodo.org) so the client can
  // preview the per-entry citation before production minting.
  zenodoCite: z
    .object({
      url: z.string(),
      sandbox: z.boolean().default(false),
    })
    .optional(),
  publishedYear: z.number().optional(), // citation year; else derive from `version` date
  authors: z.string().optional(),
  nationality: z.string().optional(),
  country: z.string().optional(),
  html: z.string().optional(),
});

export type BioData = z.infer<typeof bioDataSchema>;

const bios = defineCollection({
  loader: docxLoader({
    pattern: "**/*.docx",
    base: "./src/content/bios-processed",
  }),
  schema: z.object({
    slug: z.string().optional(),
    data: bioDataSchema,
  }),
});

export const pages = defineCollection({
  loader: glob({
    pattern: ["**/*.{md,mdx}", "!**/_*"],
    base: "./src/content/pages",
  }),
  schema: z.object({
    slug: z.string(),
    isHomepage: z.boolean().optional(),
    title: z.string().optional(),
    navLabel: z.string().optional(),
    description: z.string().optional(),
    order: z.number().optional(),
    hideFooter: z.boolean().optional(),
    hideFromNav: z.boolean().optional(),
  }),
});

export const collections = {
  bios,
  pages,
};
