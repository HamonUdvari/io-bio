// Pure BioData(-ish) → Zenodo deposition metadata mapper, plus the idempotency
// hash. No I/O, no network — easy to unit test. Consumed by scripts/zenodo-mint.ts.
import { createHash } from "node:crypto";

export interface MetaEntry {
  slug: string;
  firstName: string;
  lastName: string;
  summary: string;
  life: string;
  version: string;
  authors: string;
  nationality: string;
  roles: { title?: string; abbreviation?: string; organisation?: string }[];
  contentHash: string; // content signature emitted by the zenodo-meta endpoint
}

export interface ZenodoCreator {
  name: string;
  affiliation?: string;
  orcid?: string;
}

export interface ZenodoRelatedId {
  identifier: string;
  relation: string;
  scheme: string;
}

export interface ZenodoContributor {
  name: string; // "Family name, Given names"
  type: string; // Zenodo contributor type, e.g. "Editor"
  affiliation?: string;
  orcid?: string;
}

export interface ZenodoMetadata {
  upload_type: "publication";
  publication_type: string;
  title: string;
  creators: ZenodoCreator[];
  contributors?: ZenodoContributor[];
  description: string;
  publication_date: string; // YYYY-MM-DD
  version?: string;
  access_right: "open";
  license: string;
  // "Book section" host-work fields — how each entry declares it belongs to the
  // dictionary WITHOUT a whole-work DOI. partof_title is the load-bearing signal
  // (renders as "Part of …" on the record + in BibTeX/DataCite exports).
  partof_title?: string;
  imprint_publisher?: string;
  imprint_place?: string;
  related_identifiers: ZenodoRelatedId[];
  keywords?: string[];
  notes?: string;
  language?: string;
}

export interface MetadataConfig {
  /** SPDX-ish license id, e.g. "cc-by-nc-nd-4.0" (editors sign off on wording). */
  license: string;
  /**
   * Canonical home of the dictionary (e.g. https://io-bio.ch). Each entry links
   * to it via `isPartOf` (url scheme) — the "belongs to the dictionary" relation,
   * in place of a whole-work/software DOI.
   */
  dictionaryHomeUrl: string;
  /** Host-work title for `partof_title` (the work each entry is a section of). */
  partofTitle: string;
  /** `imprint_publisher` — the dictionary's publisher. */
  imprintPublisher: string;
  /** `imprint_place` — place of publication, "city, country". */
  imprintPlace: string;
  /** The dictionary editors, emitted as `contributors` with type "Editor". */
  editors: ZenodoContributor[];
  /** Builds the canonical public URL for an entry slug (notes + isVariantFormOf). */
  entryUrl: (slug: string) => string;
  /** Rights/colophon note appended to `notes` (mirrors the in-document footnote). */
  rightsNote?: string;
  /** publication_type — defaults to "section" (Zenodo "Book section"). */
  publicationType?: string;
  /**
   * Optional print-template fingerprint folded into the idempotency hash so a
   * LAYOUT/CSS change re-versions the deposit even when the entry's content is
   * unchanged. Set for SANDBOX only — production stays content-only so a
   * cosmetic change never churns permanent DOIs. (See zenodo-mint.ts.)
   */
  renderVersion?: string;
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** "Version 23 September 2019" → "23 September 2019". */
export function versionLabel(version: string): string {
  return (version ?? "").replace(/^Version\s+/i, "").trim();
}

/**
 * Parse a "DD Month YYYY" version into ISO `YYYY-MM-DD`. Falls back to
 * `YYYY-01-01` if only a year is found. Returns null if nothing parseable
 * (caller decides the ultimate fallback + warning).
 */
export function parsePublicationDate(version: string): string | null {
  const label = versionLabel(version);
  const m = label.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${day}`;
  }
  const y = label.match(/\b(\d{4})\b/);
  if (y) return `${y[1]}-01-01`;
  return null;
}

/** Split a display author string into Zenodo creators (no ORCID in source). */
export function splitAuthors(authors: string): ZenodoCreator[] {
  const raw = (authors ?? "").trim();
  if (!raw) return [{ name: "IO BIO" }];
  const parts = raw
    .split(/\s+and\s+|\s*&\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return (parts.length ? parts : [raw]).map((name) => ({ name }));
}

export function buildMetadata(
  e: MetaEntry,
  cfg: MetadataConfig,
): { metadata: ZenodoMetadata; warnings: string[] } {
  const warnings: string[] = [];
  const title = `${(e.lastName ?? "").toUpperCase()}, ${e.firstName ?? ""}`
    .replace(/,\s*$/, "")
    .trim();

  const provenance =
    "Entry in IO BIO, Biographical Dictionary of Secretaries-General of International Organizations.";
  const description = [e.summary, e.life, provenance]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");

  let publication_date = parsePublicationDate(e.version);
  if (!publication_date) {
    publication_date = new Date().toISOString().slice(0, 10);
    warnings.push(
      `no parseable date in version "${e.version}" — defaulted publication_date to ${publication_date}`,
    );
  }

  const keywords = Array.from(
    new Set(
      [
        e.nationality,
        ...e.roles.map((r) => r.title ?? ""),
        ...e.roles.map((r) => r.abbreviation ?? ""),
        ...e.roles.map((r) => r.organisation ?? ""),
        "biography",
        "Secretary-General",
        "international organization",
      ]
        .map((s) => (s ?? "").trim())
        .filter(Boolean),
    ),
  );

  const canonicalUrl = cfg.entryUrl(e.slug);
  // Canonical link + the rights/colophon note (mirrors the in-document footnote,
  // so the record's license claim is correct given the third-party portrait).
  const notes = [`Canonical entry: ${canonicalUrl}`, cfg.rightsNote]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  const metadata: ZenodoMetadata = {
    upload_type: "publication",
    publication_type: cfg.publicationType ?? "section",
    title,
    creators: splitAuthors(e.authors),
    contributors: cfg.editors?.length ? cfg.editors : undefined,
    description,
    publication_date,
    version: versionLabel(e.version) || undefined,
    access_right: "open",
    license: cfg.license,
    partof_title: cfg.partofTitle || undefined,
    imprint_publisher: cfg.imprintPublisher || undefined,
    imprint_place: cfg.imprintPlace || undefined,
    // Each entry belongs to the dictionary (isPartOf its home URL) and is the PDF
    // form of its online entry (isVariantFormOf). No software/whole-work DOI.
    related_identifiers: [
      {
        identifier: cfg.dictionaryHomeUrl,
        relation: "isPartOf",
        scheme: "url",
      },
      {
        identifier: canonicalUrl,
        relation: "isVariantFormOf",
        scheme: "url",
      },
    ],
    keywords: keywords.length ? keywords : undefined,
    notes: notes || undefined,
    language: "eng",
  };

  return { metadata, warnings };
}

/**
 * Idempotency key. Combines the content signature (from the endpoint) with the
 * metadata knobs that affect what we publish (license, publication_type), so a
 * content edit OR a license/type change triggers a new version, while cosmetic
 * site changes do not.
 */
export function computeStateHash(e: MetaEntry, cfg: MetadataConfig): string {
  return (
    "sha256:" +
    createHash("sha256")
      .update(
        JSON.stringify({
          content: e.contentHash,
          license: cfg.license,
          publication_type: cfg.publicationType ?? "section",
          // Only present for sandbox — a layout/template change re-versions the
          // demo deposits; absent for production (content-only permanence).
          ...(cfg.renderVersion ? { render: cfg.renderVersion } : {}),
        }),
      )
      .digest("hex")
  );
}
