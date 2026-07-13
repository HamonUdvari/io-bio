import { describe, expect, it } from "vitest";
import { buildMetadata } from "./zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./zenodo-metadata.ts";

const cfg: MetadataConfig = {
  license: "cc-by-nc-nd-4.0",
  dictionaryHomeUrl: "https://io-bio.ch",
  partofTitle:
    "IO BIO, Biographical Dictionary of Secretaries-General of International Organizations",
  imprintPublisher: "IO BIO Project, Radboud University Nijmegen",
  imprintPlace: "Nijmegen, Netherlands",
  editors: [
    { name: "Reinalda, Bob", type: "Editor" },
    { name: "Kille, Kent J.", type: "Editor" },
    { name: "Eisenberg, Jaci L.", type: "Editor" },
  ],
  entryUrl: (slug) => `https://hamonudvari.github.io/io-bio/entries/${slug}`,
  rightsNote:
    "Text © the author(s), licensed under CC BY-NC-ND 4.0. The portrait is excluded and remains under the rights of its credited source.",
};

const entry: MetaEntry = {
  slug: "annan-k-2018",
  firstName: "Kofi",
  lastName: "Annan",
  summary:
    "Ghanaian diplomat, seventh Secretary-General of the United Nations",
  life: "Born 8 April 1938 in Kumasi; died 18 August 2018 in Bern.",
  version: "Version 23 September 2019",
  authors: "Jane Doe and John Smith",
  nationality: "Ghanaian",
  roles: [
    { title: "Secretary-General", abbreviation: "UN", organisation: "United Nations" },
  ],
  contentHash: "sha256:abc",
};

describe("buildMetadata — belongs-to-the-dictionary shape", () => {
  it("tags each entry as a Book section of the dictionary", () => {
    const { metadata } = buildMetadata(entry, cfg);
    expect(metadata.publication_type).toBe("section");
    expect(metadata.partof_title).toBe(cfg.partofTitle);
    expect(metadata.imprint_publisher).toBe(cfg.imprintPublisher);
    expect(metadata.imprint_place).toBe(cfg.imprintPlace);
  });

  it("emits the editors as contributors (type Editor)", () => {
    const { metadata } = buildMetadata(entry, cfg);
    expect(metadata.contributors).toHaveLength(3);
    expect(metadata.contributors?.every((c) => c.type === "Editor")).toBe(true);
    expect(metadata.contributors?.map((c) => c.name)).toContain("Reinalda, Bob");
  });

  it("links to the dictionary home and the online entry — never a whole-work/software DOI", () => {
    const { metadata } = buildMetadata(entry, cfg);
    const rels = metadata.related_identifiers;

    const partOf = rels.find((r) => r.relation === "isPartOf");
    expect(partOf).toEqual({
      identifier: "https://io-bio.ch",
      relation: "isPartOf",
      scheme: "url",
    });

    const variant = rels.find((r) => r.relation === "isVariantFormOf");
    expect(variant?.identifier).toBe(cfg.entryUrl(entry.slug));

    // No DOI-scheme relations, and specifically not the old software archive DOI.
    expect(rels.some((r) => r.scheme === "doi")).toBe(false);
    expect(rels.some((r) => r.identifier.includes("18652171"))).toBe(false);
  });

  it("carries the license + rights footnote and the canonical link in notes", () => {
    const { metadata } = buildMetadata(entry, cfg);
    expect(metadata.license).toBe("cc-by-nc-nd-4.0");
    expect(metadata.access_right).toBe("open");
    expect(metadata.notes).toContain("Canonical entry:");
    expect(metadata.notes).toContain("CC BY-NC-ND 4.0");
    expect(metadata.notes).toContain("portrait is excluded");
  });

  it("keeps the existing title, creators and parsed date", () => {
    const { metadata } = buildMetadata(entry, cfg);
    expect(metadata.title).toBe("ANNAN, Kofi");
    expect(metadata.creators.map((c) => c.name)).toEqual(["Jane Doe", "John Smith"]);
    expect(metadata.publication_date).toBe("2019-09-23");
  });
});
