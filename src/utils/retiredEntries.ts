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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { slug as githubSlug } from "github-slugger";
import { globSync } from "tinyglobby";

export interface RetiredEntry {
  slug: string;
  conceptDoi: string;
  title?: string;
  authors?: string;
}

type DoiMapLike = Record<
  string,
  | {
      conceptDoi?: unknown;
      versionDoi?: unknown;
      env?: string;
      title?: string;
      authors?: string;
    }
  | undefined
>;

/** The production slug → DOI map (empty until production DOIs are minted).
 *  A missing file is fine; a malformed one FAILS the build — it holds permanent
 *  DOIs, and silently reading it as empty would turn every tombstone into a 404. */
export function readProductionDoiMap(
  file = path.resolve("src/data/zenodo-dois.json"),
): DoiMapLike {
  if (!existsSync(file)) return {};
  const name = path.relative(process.cwd(), file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${name} must be a JSON object (slug → DOI record)`);
  return parsed as DoiMapLike;
}

/** Ids of the current Word files — the SAME rule as the docx loader: the same
 *  glob (`**\/*.docx` via tinyglobby: case-sensitive, recursive, no dotfiles) and
 *  the same id (github-slugger on each path segment, extension and a trailing
 *  "/index" removed). */
export function currentEntrySlugs(
  dir = path.resolve("src/content/bios"),
): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(
    globSync("**/*.docx", { cwd: dir, expandDirectories: false }).map((rel) =>
      rel
        .slice(0, -path.extname(rel).length)
        .split("/")
        .map((segment) => githubSlug(segment))
        .join("/")
        .replace(/\/index$/, ""),
    ),
  );
}

const isSandboxDoi = (doi: unknown) =>
  typeof doi === "string" && doi.startsWith("10.5072/");

/** Slugs that have a production DOI but no current entry, sorted for stable
 *  output. Records with a missing/non-string concept DOI, a sandbox DOI
 *  (10.5072/) or a non-production `env` are ignored — even if they were copied
 *  into the production map by mistake. */
export function retiredEntries(
  map: DoiMapLike,
  current: Set<string>,
): RetiredEntry[] {
  return Object.entries(map)
    .filter(
      ([slug, rec]) =>
        !current.has(slug) &&
        typeof rec?.conceptDoi === "string" &&
        rec.conceptDoi !== "" &&
        !isSandboxDoi(rec.conceptDoi) &&
        !isSandboxDoi(rec.versionDoi) &&
        (rec.env === undefined || rec.env === "production"),
    )
    .map(([slug, rec]) => ({
      slug,
      conceptDoi: rec!.conceptDoi as string,
      ...(rec!.title ? { title: rec!.title } : {}),
      ...(rec!.authors ? { authors: rec!.authors } : {}),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Sitemap filter helper: is this URL path a withdrawn-entry tombstone?
 *  @astrojs/sitemap passes percent-encoded paths (e.g. hammarskj%C3%B6ld-…)
 *  while slugs are raw Unicode, so decode before comparing. Kept here (not in
 *  astro.config.mjs) so tombstone changes don't touch that print-template input. */
export function makeRetiredEntryMatcher(
  entries: RetiredEntry[] = retiredEntries(
    readProductionDoiMap(),
    currentEntrySlugs(),
  ),
): (pathname: string) => boolean {
  const paths = new Set(entries.map((r) => `/entries/${r.slug}/`));
  return (pathname) => {
    let p = pathname;
    try {
      p = decodeURIComponent(pathname);
    } catch {
      /* malformed escape — compare the raw path */
    }
    return paths.has(p.endsWith("/") ? p : `${p}/`);
  };
}
