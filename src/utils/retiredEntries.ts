// Withdrawn entries that keep a "tombstone" page.
//
// Once an entry has a PERMANENT (production) Zenodo DOI, deleting its .docx must
// not leave its URL dead: the DOI resolves to the Zenodo record, and that record
// names /entries/<slug>/ as the canonical entry. So for every slug in the
// production DOI map that no longer has a Word file, the site keeps a small
// "withdrawn" page at the old URL (noindex, left out of the sitemap, search and
// list) that links to the archived version on Zenodo.
//
// The DOI map itself is never pruned: if the entry comes back under the same
// file name, `zenodo-mint` continues it under its existing concept DOI instead of
// minting a duplicate. Sandbox test DOIs never produce tombstones — old test and
// renamed slugs live in that map and must not become public pages.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { slug as githubSlug } from "github-slugger";

export interface RetiredEntry {
  slug: string;
  conceptDoi: string;
  title?: string;
  authors?: string;
}

type DoiMapLike = Record<
  string,
  { conceptDoi?: string; title?: string; authors?: string } | undefined
>;

/** The production slug → DOI map (empty until production DOIs are minted). */
export function readProductionDoiMap(
  file = path.resolve("src/data/zenodo-dois.json"),
): DoiMapLike {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Slugs of the current Word files — the same id rule as the docx loader
 *  (github-slugger on the file name without its extension). */
export function currentEntrySlugs(
  dir = path.resolve("src/content/bios"),
): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".docx"))
      .map((f) => githubSlug(path.basename(f, path.extname(f)))),
  );
}

/** Slugs that have a DOI but no current entry, sorted for stable output. */
export function retiredEntries(
  map: DoiMapLike,
  current: Set<string>,
): RetiredEntry[] {
  return Object.entries(map)
    .filter(([slug, rec]) => !current.has(slug) && !!rec?.conceptDoi)
    .map(([slug, rec]) => ({
      slug,
      conceptDoi: rec!.conceptDoi as string,
      ...(rec!.title ? { title: rec!.title } : {}),
      ...(rec!.authors ? { authors: rec!.authors } : {}),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
