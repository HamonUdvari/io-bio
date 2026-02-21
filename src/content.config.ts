import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { OfficeParser } from "officeparser";
import { glob as devGlob } from "./content/loaders/globLoader.ts";
import { docxLoader } from "./content/loaders/docxLoader.ts";

const tests = defineCollection({
  loader: devGlob({ pattern: "**/*.md", base: "./src/content/test" }),
  schema: z.object({
    slug: z.string().optional(),
  }),
});

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

export const bioDataSchema = z.object({
  title: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  knownAs: z.string().optional(),
  summary: z.string(),
  image: imageSchema.optional(),
  imageSource: z.string().optional(),
  life: z.string(),
  archives: z.string().optional(),
  publications: z.string().optional(),
  literature: z.string().optional(),
  version: z.string().optional(),
  authors: z.string().optional(),
  organisation: z.string().optional(),
  role: z.string().optional(),
  nationality: z.string().optional(),
  country: z.string().optional(),
  startYear: z.number().optional(),
  endYear: z.number().optional(),
  html: z.string().optional(),
});

export type BioData = z.infer<typeof bioDataSchema>;

const bios = defineCollection({
  loader: docxLoader({ pattern: "**/*.docx", base: "./src/content/bios" }),
  schema: z.object({
    slug: z.string().optional(),
    data: bioDataSchema,
  }),
});

export const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    slug: z.string(),
    isHomepage: z.boolean().optional(),
    title: z.string().optional(),
    description: z.string().optional()
  }),
});

export const collections = {
  tests,
  bios,
  pages,
};
