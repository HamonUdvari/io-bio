import { describe, expect, it } from "vitest";
import {
  buildMetadata,
  computeStateHash,
  htmlParagraphs,
  splitAuthors,
  splitEditors,
} from "./zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./zenodo-metadata.ts";

const cfg: MetadataConfig = {
  license: "cc-by-nc-nd-4.0",
  dictionaryHomeUrl: "https://www.io-bio.ch",
  partofTitle:
    "IO BIO, Biographical Dictionary of Secretaries-General of International Organizations",
  imprintPublisher: "IO BIO",
  imprintPlace: "",
  editors: [
    { name: "Reinalda, Bob", type: "Editor" },
    { name: "Kille, Kent J.", type: "Editor" },
    { name: "Eisenberg, Jaci L.", type: "Editor" },
  ],
  entryUrl: (slug) => `https://www.io-bio.ch/entries/${slug}`,
  rightsNote:
    "Text © the author(s) and IO BIO, licensed under CC BY-NC-ND 4.0. The portrait is excluded and remains under the rights of its credited source. We have tried to trace the rights holder to obtain permission for the use of the portrait, but contact us in case we have failed.",
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
  editors: "Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg",
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
    expect(metadata.imprint_publisher).toBe("IO BIO");
  });

  it("sends no place of publication when none is set, and a set one as is", () => {
    expect(buildMetadata(entry, cfg).metadata.imprint_place).toBeUndefined();
    const { metadata } = buildMetadata(entry, {
      ...cfg,
      imprintPlace: "City, Country",
    });
    expect(metadata.imprint_place).toBe("City, Country");
  });

  it("mirrors the entry's own editors as contributors (type Editor)", () => {
    const { metadata } = buildMetadata(entry, cfg);
    expect(metadata.contributors).toHaveLength(3);
    expect(metadata.contributors?.every((c) => c.type === "Editor")).toBe(true);
    // Per-entry prose ("First Last"), not the curated "Last, First" list.
    expect(metadata.contributors?.map((c) => c.name)).toEqual([
      "Bob Reinalda",
      "Kent J. Kille",
      "Jaci L. Eisenberg",
    ]);
  });

  it("falls back to the curated editor list when the entry has no editors", () => {
    const { metadata } = buildMetadata({ ...entry, editors: "" }, cfg);
    expect(metadata.contributors?.map((c) => c.name)).toEqual([
      "Reinalda, Bob",
      "Kille, Kent J.",
      "Eisenberg, Jaci L.",
    ]);
  });

  it("links to the dictionary home and the online entry — never a whole-work/software DOI", () => {
    const { metadata } = buildMetadata(entry, cfg);
    const rels = metadata.related_identifiers;

    const partOf = rels.find((r) => r.relation === "isPartOf");
    expect(partOf).toEqual({
      identifier: "https://www.io-bio.ch",
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

  it("builds Lie's creators from the authors, never from the byline", () => {
    const { metadata } = buildMetadata(
      {
        ...entry,
        authors: "James P. Muldoon, Jr. and Ellen Jenny Ravndal",
        byline: "James P. Muldoon, Jr. (†) and Ellen Jenny Ravndal",
      } as MetaEntry,
      cfg,
    );
    expect(metadata.creators.map((c) => c.name)).toEqual([
      "James P. Muldoon Jr.",
      "Ellen Jenny Ravndal",
    ]);
  });
});

describe("description and notes as HTML paragraphs", () => {
  const strip = (html: string) => html.replace(/<[^>]+>/g, "");

  it("puts the summary, the life text and the provenance in separate paragraphs", () => {
    const { metadata } = buildMetadata(entry, cfg);
    expect(metadata.description).toBe(
      [
        "<p>Ghanaian diplomat, seventh Secretary-General of the United Nations</p>",
        "<p>Born 8 April 1938 in Kumasi; died 18 August 2018 in Bern.</p>",
        "<p>Entry in IO BIO, Biographical Dictionary of Secretaries-General of International Organizations.</p>",
      ].join("\n"),
    );
  });

  it("keeps a space between the parts when Zenodo strips the tags", () => {
    const { metadata } = buildMetadata(
      {
        ...entry,
        summary: "First Secretary-General of the United Nations 1946-1953",
        life: "Was born 16 July 1896 in Oslo.",
      },
      cfg,
    );
    const text = strip(metadata.description);
    expect(text).not.toContain("1953Was");
    expect(text).toContain("1946-1953\nWas born 16 July 1896");
  });

  it("keeps an entity that the text already holds", () => {
    expect(htmlParagraphs(["&copy; IO BIO &#169; &amp; R & D"])).toBe(
      "<p>&copy; IO BIO &#169; &amp; R &amp; D</p>",
    );
  });

  it("escapes &, < and > in the text", () => {
    expect(htmlParagraphs(["Food & Agriculture <FAO>", "", undefined])).toBe(
      "<p>Food &amp; Agriculture &lt;FAO&gt;</p>",
    );
  });

  it("puts the canonical link and each rights paragraph in its own paragraph", () => {
    const { metadata } = buildMetadata(entry, {
      ...cfg,
      rightsNote: "Text © the author(s).\n\nThe portrait is excluded.",
    });
    expect(metadata.notes).toBe(
      [
        "<p>Canonical entry: https://www.io-bio.ch/entries/annan-k-2018</p>",
        "<p>Text © the author(s).</p>",
        "<p>The portrait is excluded.</p>",
      ].join("\n"),
    );
  });

  it("sends only the canonical link when there is no rights note", () => {
    const { metadata } = buildMetadata(entry, {
      ...cfg,
      rightsNote: undefined,
    });
    expect(metadata.notes).toBe(
      "<p>Canonical entry: https://www.io-bio.ch/entries/annan-k-2018</p>",
    );
  });
});

describe("splitAuthors", () => {
  const names = (s: string) => splitAuthors(s).map((c) => c.name);

  it("keeps 'First Last' names as written", () => {
    expect(names("Auriane Guilbaud")).toEqual(["Auriane Guilbaud"]);
    expect(names("Valentine M. Moghadam and Jessica Walker")).toEqual([
      "Valentine M. Moghadam",
      "Jessica Walker",
    ]);
    expect(names("Marijke van Faassen & Marina Pérez de Arcos")).toEqual([
      "Marijke van Faassen",
      "Marina Pérez de Arcos",
    ]);
  });

  it("joins a suffix to its name without the comma (Zenodo reads a comma as 'Family, Given')", () => {
    expect(names("James P. Muldoon, Jr. and Ellen Jenny Ravndal")).toEqual([
      "James P. Muldoon Jr.",
      "Ellen Jenny Ravndal",
    ]);
    expect(names("John Smith, Sr.")).toEqual(["John Smith Sr."]);
    expect(names("John Smith, III and Jane Doe")).toEqual([
      "John Smith III",
      "Jane Doe",
    ]);
  });

  it("splits a comma list of authors, with or without the serial comma", () => {
    expect(names("Ann Lee, Bo Chen and Cy Diaz")).toEqual([
      "Ann Lee",
      "Bo Chen",
      "Cy Diaz",
    ]);
    expect(names("Ann Lee, Bo Chen, and Cy Diaz")).toEqual([
      "Ann Lee",
      "Bo Chen",
      "Cy Diaz",
    ]);
  });

  it("never sends a comma to Zenodo", () => {
    for (const s of [
      "James P. Muldoon, Jr. and Ellen Jenny Ravndal",
      "Ann Lee, Bo Chen, and Cy Diaz",
      "John Smith, III",
    ]) {
      for (const n of names(s)) expect(n).not.toContain(",");
    }
  });

  it("falls back to IO BIO when there are no authors", () => {
    expect(names("")).toEqual(["IO BIO"]);
    expect(names(" , ")).toEqual(["IO BIO"]);
  });

  it("drops an 'et al.', as for the editors", () => {
    expect(names("Ann Lee et al.")).toEqual(["Ann Lee"]);
    expect(names("Ann Lee, et al.")).toEqual(["Ann Lee"]);
  });

  it("joins only a suffix that follows a comma", () => {
    expect(names("John Smith, Jnr and Jane Doe, V")).toEqual([
      "John Smith Jnr",
      "Jane Doe V",
    ]);
    expect(names("Ann Lee and Jr.")).toEqual(["Ann Lee", "Jr."]);
  });

  it("warns about a one-word name, e.g. from a 'Last, First' form", () => {
    const { metadata, warnings } = buildMetadata(
      { ...entry, authors: "Kille, Kent J." },
      cfg,
    );
    expect(metadata.creators.map((c) => c.name)).toEqual(["Kille", "Kent J."]);
    expect(warnings.join("\n")).toContain('one-word name "Kille"');
    expect(buildMetadata(entry, cfg).warnings).toEqual([]);
  });

  it("warns when an entry has no authors and IO BIO becomes the creator", () => {
    const { metadata, warnings } = buildMetadata(
      { ...entry, authors: "" },
      cfg,
    );
    expect(metadata.creators).toEqual([{ name: "IO BIO" }]);
    expect(warnings.join("\n")).toContain("no authors");
    const etAl = buildMetadata({ ...entry, authors: "et al." }, cfg);
    expect(etAl.warnings.join("\n")).toContain("no authors");
  });
});

describe("splitEditors", () => {
  it("splits 'A, B and C' prose into Editor contributors", () => {
    expect(
      splitEditors("Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg"),
    ).toEqual([
      { name: "Bob Reinalda", type: "Editor" },
      { name: "Kent J. Kille", type: "Editor" },
      { name: "Jaci L. Eisenberg", type: "Editor" },
    ]);
  });

  it("drops a leading 'edited by' and any 'et al.' token", () => {
    expect(splitEditors("edited by Bob Reinalda et al.")).toEqual([
      { name: "Bob Reinalda", type: "Editor" },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(splitEditors("")).toEqual([]);
  });
});

describe("computeStateHash", () => {
  it("changes when the rights note changes (keeps the record in sync — no drift)", () => {
    const a = computeStateHash(entry, cfg);
    const b = computeStateHash(entry, { ...cfg, rightsNote: "A different note." });
    expect(a).not.toBe(b);
  });

  it("changes when the entry content hash changes (editors ride in it)", () => {
    const a = computeStateHash(entry, cfg);
    const b = computeStateHash({ ...entry, contentHash: "sha256:changed" }, cfg);
    expect(a).not.toBe(b);
  });
});
