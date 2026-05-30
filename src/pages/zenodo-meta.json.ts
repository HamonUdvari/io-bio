import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { createHash } from "node:crypto";

// Build-time data source for the Zenodo per-entry minting pipeline
// (`scripts/zenodo-mint.ts`). Emitted as a static `dist/zenodo-meta.json` so the
// plain-`node` mint script reads the EXACT site-parsed entry data (via the same
// content collection the pages use) without re-running the DOCX parsers or
// importing Astro internals. It contains only public entry metadata.
//
// `contentHash` is a signature over the biography's *content* (not the site's
// CSS/chrome), so a real content edit produces a new hash → a new Zenodo
// version on the next mint, while cosmetic site changes do not churn versions.
export const prerender = true;

export const GET: APIRoute = async () => {
  const bios = await getCollection("bios");

  const entries = bios.map((b) => {
    const d = b.data as Record<string, any>;
    const roles = (d.roles ?? []).map((r: Record<string, any>) => ({
      title: r.title ?? "",
      abbreviation: r.abbreviation ?? "",
      organisation: r.organisation ?? "",
    }));

    const contentHash =
      "sha256:" +
      createHash("sha256")
        .update(
          JSON.stringify({
            html: d.html ?? "",
            summary: d.summary ?? "",
            life: d.life ?? "",
            version: d.version ?? "",
            authors: d.authors ?? "",
            nationality: d.nationality ?? "",
            roles,
          }),
        )
        .digest("hex");

    return {
      slug: b.id,
      firstName: d.firstName ?? "",
      lastName: d.lastName ?? "",
      summary: d.summary ?? "",
      life: d.life ?? "",
      version: d.version ?? "",
      authors: d.authors ?? "",
      nationality: d.nationality ?? "",
      roles,
      contentHash,
    };
  });

  entries.sort((a, b) => a.slug.localeCompare(b.slug));

  return new Response(JSON.stringify(entries, null, 2), {
    headers: { "content-type": "application/json" },
  });
};
