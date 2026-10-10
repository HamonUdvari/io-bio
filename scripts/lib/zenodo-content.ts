// The per-entry content hash behind the Zenodo idempotency key: it covers
// exactly what the deposited PDF and the record metadata show, so a change the
// reader can see re-versions the deposit, and nothing else does.
//
// Used by src/pages/zenodo-meta.json.ts (contentHash) at build time. Lives in
// scripts/lib so vitest can import it in plain Node and the sandbox refresh
// workflow's `scripts/lib/zenodo-*.ts` path filter watches it.
//
// Every entry field is listed in HASHED_FIELDS or UNHASHED_FIELDS;
// zenodo-content.test.ts fails when the loader or the article template uses a
// field that is in neither list. Hashing too much costs an extra version;
// hashing too little leaves a stale PDF.
import { createHash } from "node:crypto";

/** Bump to re-version every deposit once (e.g. when pdfContent's shape changes). */
export const CONTENT_VERSION = 2;

export const HASHED_FIELDS = [
  "firstName",
  "lastName",
  "knownAs",
  "nee",
  "summary",
  "life",
  "introNotes",
  "imageSource",
  "authors",
  "editors",
  "version",
  "archives",
  "publications",
  "literature",
  "body",
  "nationality",
  "roles",
  "imageHash",
  "zenodoCite",
] as const;

/** Entry fields deliberately left out of the hash, with the reason. */
export const UNHASHED_FIELDS: Record<string, string> = {
  title: "the .docx file name; the PDF shows the parsed name fields",
  image: "an empty placeholder; the portrait bytes are in imageHash",
  imageFn: "the portrait's file name; its bytes are in imageHash",
  imagePortraitFn: "the grid-view crop, not in the PDF",
  html: "the whole document, claimed paragraphs included; the PDF shows body and the parsed fields",
  versionDoi: "changes on every mint, so hashing it would re-version every run",
  conceptDoi: "only the citation kind matters (zenodoCite)",
  publishedYear: "not set by the loader",
};

type Data = Record<string, any>;

/** The kind of "How to cite" link the PDF prints. The URL itself is not hashed:
 *  the production URL can fall back to the version DOI, which changes every mint. */
export function citeKind(cite: unknown): "none" | "sandbox" | "doi" {
  if (!cite || typeof cite !== "object") return "none";
  return (cite as { sandbox?: boolean }).sandbox ? "sandbox" : "doi";
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * What the PDF and the record metadata show for one entry. Raw values where the
 * template derives the display text (editors, imageSource): a superset of what
 * renders, without duplicating the template logic.
 */
export function pdfContent(d: Data, opts: { citationEditors?: string } = {}) {
  return {
    v: CONTENT_VERSION,
    firstName: str(d.firstName),
    lastName: str(d.lastName),
    knownAs: str(d.knownAs),
    nee: str(d.nee),
    summary: str(d.summary),
    life: str(d.life),
    introNotes: (d.introNotes ?? []).map(str),
    imageSource: str(d.imageSource),
    authors: str(d.authors),
    editors: str(d.editors),
    // The CMS default, which the template prints only when the entry has no
    // editors of its own.
    citationEditors: str(d.editors).trim() ? "" : str(opts.citationEditors),
    version: str(d.version),
    // Whole list objects (items + footers), so a new list field is covered too.
    archives: d.archives ?? null,
    publications: d.publications ?? null,
    literature: d.literature ?? null,
    // Collapse only ASCII whitespace: an NBSP change still counts.
    body: str(d.body)
      .replace(/[ \t\n\r\f]+/g, " ")
      .trim(),
    nationality: str(d.nationality),
    roles: (d.roles ?? []).map((r: any) => ({
      title: str(r?.title),
      abbreviation: str(r?.abbreviation),
      organisation: str(r?.organisation),
    })),
    imageHash: str(d.imageHash),
    cite: citeKind(d.zenodoCite),
  };
}

export function pdfContentHash(
  d: Data,
  opts: { citationEditors?: string } = {},
): string {
  return (
    "sha256:" +
    createHash("sha256")
      .update(JSON.stringify(pdfContent(d, opts)))
      .digest("hex")
  );
}
