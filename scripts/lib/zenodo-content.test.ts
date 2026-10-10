import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HASHED_FIELDS,
  UNHASHED_FIELDS,
  pdfContentHash,
} from "./zenodo-content";

const repo = (p: string) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LISTED = new Set<string>([
  ...HASHED_FIELDS,
  ...Object.keys(UNHASHED_FIELDS),
]);

/** Fields the article template and the print route read from `data`. */
function templateFields(): string[] {
  const out = new Set<string>();
  for (const f of [
    "src/components/EntryArticle.astro",
    "src/pages/print/[slug].astro",
  ]) {
    const src = repo(f);
    for (const m of src.matchAll(/const \{([^}]*)\} = data;/g))
      for (const k of m[1].split(",")) if (k.trim()) out.add(k.trim());
    for (const m of src.matchAll(/\bdata\.(\w+)/g)) out.add(m[1]);
  }
  return [...out];
}

/** Keys of the entry data the loader stores (it skips schema parsing, so this is the truth). */
function loaderFields(): string[] {
  const src = repo("src/loaders/docxLoader.ts");
  const start = src.indexOf("const data = {");
  const block = src.slice(start, src.indexOf("\n    };", start));
  const keys = [...block.matchAll(/^ {6}(\w+)[:,]/gm)].map((m) => m[1]);
  for (const m of src.matchAll(/\(data as [^)]*\)\.(\w+)\s*=/g))
    keys.push(m[1]);
  return keys;
}

/** Keys bioDataSchema declares in content.config.ts. */
function schemaFields(): string[] {
  const src = repo("src/content.config.ts");
  const start = src.indexOf("export const bioDataSchema = z.object({");
  const block = src.slice(start, src.indexOf("\n});", start));
  return [...block.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

const base = () => ({
  title: "Aleph-A 2020",
  firstName: "Alpha",
  lastName: "Aleph",
  knownAs: "Al",
  nee: "",
  summary: "Secretary-General of Org",
  life: "1900-1990",
  introNotes: ["A note"],
  imageSource: "Source: Archive, www.example.org",
  authors: "Author One",
  editors: "Editor One",
  version: "1 January 2020",
  archives: { items: [{ raw: "Papers" }] },
  publications: { items: [{ raw: "Book, 1950" }, { raw: "Article, 1960" }] },
  literature: {
    items: [{ raw: "Study, 2000" }],
    websitesAccessedOn: "1 May 2020",
  },
  body: "<p>Alpha was born.</p>\n<p>Alpha <strong>led</strong> Org.</p>",
  nationality: "Dutch",
  roles: [
    { title: "Secretary-General", abbreviation: "ORG", organisation: "Org" },
  ],
  imageHash: "abc",
  zenodoCite: { url: "https://sandbox.zenodo.org/records/1", sandbox: true },
  image: {},
  imageFn: "aleph-a-2020.jpg",
  imagePortraitFn: "aleph-a-2020-portrait.jpg",
  html: "<p>whole document</p>",
  versionDoi: "10.5072/zenodo.2",
  conceptDoi: "10.5072/zenodo.1",
  publishedYear: 2020,
});
type Entry = ReturnType<typeof base>;
const hash = (d: Entry, citationEditors = "edited by X") =>
  pdfContentHash(d, { citationEditors });

const CHANGE: Record<(typeof HASHED_FIELDS)[number], (d: Entry) => void> = {
  firstName: (d) => (d.firstName = "Alfa"),
  lastName: (d) => (d.lastName = "Alef"),
  knownAs: (d) => (d.knownAs = "Alpha"),
  nee: (d) => (d.nee = "Beth"),
  summary: (d) => (d.summary = "Director of Org"),
  life: (d) => (d.life = "1900-1991"),
  introNotes: (d) => d.introNotes.push("Second note"),
  imageSource: (d) => (d.imageSource = "Source: Other"),
  authors: (d) => (d.authors = "Author Two"),
  editors: (d) => (d.editors = "Editor Two"),
  version: (d) => (d.version = "2 January 2020"),
  archives: (d) => (d.archives.items[0].raw = "Papers, box 1"),
  publications: (d) => d.publications.items.pop(),
  literature: (d) => (d.literature.websitesAccessedOn = "2 May 2020"),
  body: (d) => (d.body = d.body.replace("<strong>led</strong>", "led")),
  nationality: (d) => (d.nationality = "Belgian"),
  roles: (d) => (d.roles[0].abbreviation = "ORG2"),
  imageHash: (d) => (d.imageHash = "def"),
  zenodoCite: (d) => (d.zenodoCite.sandbox = false),
};

describe("pdfContentHash field coverage", () => {
  // Sentinels: each extraction must find these, or its regex has broken.
  it.each([
    [
      "the loader stores",
      loaderFields,
      ["title", "body", "imageHash", "zenodoCite", "literature"],
    ],
    [
      "the schema declares",
      schemaFields,
      ["title", "image", "archives", "zenodoCite", "imageHash"],
    ],
    [
      "the template reads",
      templateFields,
      ["lastName", "archives", "imageFn", "zenodoCite"],
    ],
  ])("lists every field %s", (_, fields, sentinels) => {
    const found = fields();
    expect(found).toEqual(expect.arrayContaining(sentinels));
    expect(found.filter((f) => !LISTED.has(f))).toEqual([]);
  });

  it("keeps the hashed and unhashed lists apart", () => {
    expect(HASHED_FIELDS.filter((f) => f in UNHASHED_FIELDS)).toEqual([]);
  });

  it.each(HASHED_FIELDS)("re-versions when %s changes", (field) => {
    const d = base();
    CHANGE[field](d);
    expect(hash(d)).not.toBe(hash(base()));
  });

  it.each(Object.keys(UNHASHED_FIELDS))(
    "does not re-version when %s changes",
    (field) => {
      const d = base() as Record<string, unknown>;
      d[field] =
        typeof d[field] === "number"
          ? 1999
          : field === "image"
            ? { a: 1 }
            : "changed";
      expect(hash(d as Entry)).toBe(hash(base()));
    },
  );
});

describe("pdfContentHash details", () => {
  it("hashes the citation kind, not its URL", () => {
    const moved = base();
    moved.zenodoCite.url = "https://sandbox.zenodo.org/records/9";
    expect(hash(moved)).toBe(hash(base()));
    const none = base() as Record<string, unknown>;
    delete none.zenodoCite;
    const doi = base();
    doi.zenodoCite = {
      url: "https://doi.org/10.5281/zenodo.1",
      sandbox: false,
    };
    expect(new Set([hash(base()), hash(none as Entry), hash(doi)]).size).toBe(
      3,
    );
  });

  it("re-versions when a list is split differently", () => {
    const merged = base();
    merged.publications.items = [{ raw: "Book, 1950; Article, 1960" }];
    expect(hash(merged)).not.toBe(hash(base()));
  });

  it("re-versions when a footer note appears", () => {
    const d = base() as any;
    d.literature.websitesNote = "(all websites visited 1 May 2020)";
    expect(hash(d)).not.toBe(hash(base()));
  });

  it("hashes the CMS default editors only when the entry has none", () => {
    expect(hash(base(), "edited by Y")).toBe(hash(base()));
    const none = base();
    none.editors = " ";
    expect(hash(none, "edited by Y")).not.toBe(hash(none));
  });

  it("counts an NBSP change in the body", () => {
    const d = base();
    d.body = d.body.replace("Alpha was", "Alpha\u00a0was");
    expect(hash(d)).not.toBe(hash(base()));
  });

  it("covers a new list field", () => {
    const d = base() as any;
    d.archives.newField = "x";
    expect(hash(d)).not.toBe(hash(base()));
  });

  it("ignores whitespace-only body changes", () => {
    const d = base();
    d.body = d.body.replace("\n", "\n\n  ");
    expect(hash(d)).toBe(hash(base()));
  });
});
