import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { OfficeParser } from "officeparser";
import { glob as devGlob } from "./content/loaders/globLoader.ts";
import { glob as devGlob } from "./content/loaders/globLoader.ts";
import { docxLoader } from "./content/loaders/docxLoader.ts";

// todo - read in all the word files

const tests = defineCollection({
  loader: devGlob({ pattern: "**/*.md", base: "./src/content/test" }),
  schema: z.object({
    slug: z.string().optional(),
  }),
});

const bios = defineCollection({
  loader: docxLoader({ pattern: "**/*.{doc,docx}", base: "./src/content/bios" }),
  schema: z.object({
    slug: z.string().optional(),
  }),
});

export const collections = {
  tests,
  bios,
};
