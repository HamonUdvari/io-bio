import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Build-time per-entry roles + display name, emitted as static dist/entry-roles.json.
// Consumed by scripts/sync-entry-overrides.ts to MIRROR each entry's roles into
// the CMS-editable src/data/entry-overrides/<slug>.json (the WYSIWYG starting
// point). Emitting from the real content loader guarantees the mirror is
// byte-identical to what the site renders — no standalone re-parse to drift.
// `roles` here is the EFFECTIVE roles (post-override); the sync only uses it for
// NON-override entries, where it equals the live Word roles. Mirrors the pattern
// in src/pages/search-index.json.ts.
export const prerender = true;

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

    return { slug: b.id, name, roles };
  });

  return new Response(JSON.stringify(entries), {
    headers: { "content-type": "application/json" },
  });
};
