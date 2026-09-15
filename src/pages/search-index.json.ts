import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { aliasSuffix } from "@utils/displayName";

// Build-time full-text search index for the client-side Fuse.js overlay
// (src/components/SearchOverlay.astro). Emitted as a static `dist/search-index.json`
// (prerendered) and ALSO served in `astro dev`, so search works in dev without a
// full build. Mirrors the pattern in `src/pages/zenodo-meta.json.ts`. Contains
// only public entry text — the same fields the entry page shows, minus the
// citation/editors boilerplate (so an editor's name doesn't match every entry).
export const prerender = true;

/** Strip tags + decode the few HTML entities the docx pipeline emits → plain text. */
function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const GET: APIRoute = async () => {
  const bios = await getCollection("bios");

  const entries = bios.map((b) => {
    const d = b.data as Record<string, any>;
    const first = d.firstName ?? "";
    const last = d.lastName ?? "";
    const title =
      `${last.toUpperCase()}, ${first}`.replace(/,\s*$/, "").trim() +
      aliasSuffix(d.knownAs, `${first} ${last}`, d.nee);

    const roles = (d.roles ?? []).map((r: Record<string, any>) => ({
      title: r.title ?? "",
      organisation: r.organisation ?? "",
      abbreviation: r.abbreviation ?? "",
    }));

    // Full-text body = the cleaned biography prose + the APL (archives /
    // publications / literature) items — matching what Pagefind indexed.
    const aplText = ["archives", "publications", "literature"]
      .flatMap((k) => (d[k]?.items ?? []).map((i: Record<string, any>) => i.raw ?? ""))
      .join(" ");
    const body = `${htmlToText(d.body ?? "")} ${aplText}`.replace(/\s+/g, " ").trim();

    return {
      slug: b.id,
      title,
      summary: d.summary ?? "",
      life: d.life ?? "",
      nationality: d.nationality ?? "",
      authors: d.authors ?? "",
      roles,
      body,
    };
  });

  entries.sort((a, b) => a.title.localeCompare(b.title));

  return new Response(JSON.stringify(entries), {
    headers: { "content-type": "application/json" },
  });
};
