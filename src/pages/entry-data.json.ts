import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Build-time per-entry data (roles + display name + the overridable "detail"
// fields), emitted as static dist/entry-data.json. Consumed by
// scripts/sync-entry-overrides.ts to MIRROR each entry into the CMS-editable
// src/data/entry-overrides/<slug>.json (the WYSIWYG starting point). Emitting
// from the real content loader guarantees the mirror is byte-identical to what
// the site renders — no standalone re-parse to drift. Values are the EFFECTIVE
// (post-override) ones; the sync only mirrors them for entries where the
// matching override toggle is OFF (where they equal the live Word values).
// Mirrors the pattern in src/pages/search-index.json.ts.
export const prerender = true;

// Keep in sync with DETAIL_FIELDS in src/loaders/docxLoader.ts (preview order).
const DETAIL_FIELDS = [
  "imageSource",
  "lastName",
  "firstName",
  "knownAs",
  "nee",
  "summary",
  "life",
  "nationality",
  "country",
  "version",
  "authors",
  "editors",
] as const;

export const GET: APIRoute = async () => {
  const bios = await getCollection("bios");

  const entries = bios.map((b) => {
    const d = b.data as Record<string, any>;
    const first = (d.firstName ?? "").trim();
    const last = (d.lastName ?? "").trim();
    const name =
      last && first
        ? `${last.toUpperCase()}, ${first}`
        : d.knownAs || last || first || b.id;

    const roles = (d.roles ?? []).map((r: Record<string, any>) => {
      const out: Record<string, unknown> = { title: r.title ?? "" };
      if (r.organisation) out.organisation = r.organisation;
      if (r.abbreviation) out.abbreviation = r.abbreviation;
      if (typeof r.startYear === "number") out.startYear = r.startYear;
      if (typeof r.endYear === "number") out.endYear = r.endYear;
      if (r.ordinalText) out.ordinalText = r.ordinalText;
      return out;
    });

    const details: Record<string, string> = {};
    for (const k of DETAIL_FIELDS) details[k] = d[k] == null ? "" : String(d[k]);

    // imageFn = the active portrait filename (Word photo or override) under
    // src/assets/bios/. The sync reads it to build the read-only CMS preview.
    return { slug: b.id, name, roles, details, imageFn: d.imageFn ?? "" };
  });

  return new Response(JSON.stringify(entries), {
    headers: { "content-type": "application/json" },
  });
};
