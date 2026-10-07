// Committed slug → DOI map. Two files keep sandbox test DOIs (10.5072) and
// production DOIs (10.5281) strictly separate so test DOIs can never ship.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export interface DoiRecord {
  recordId: number; // Zenodo deposition/record id of the current version
  conceptRecId?: number; // concept (all-versions) record id, for bookkeeping
  conceptDoi: string; // version-independent DOI (always-latest)
  versionDoi: string; // this specific version's DOI
  contentHash: string; // see computeStateHash
  status: string; // "published" | "draft"
  version: string; // versionLabel that was minted
  mintedAt: string; // ISO timestamp
  env: string; // "sandbox" | "production"
  // Display data for a withdrawn entry's tombstone page (src/utils/
  // retiredEntries.ts): once the .docx is gone, the map is the only place left
  // that knows the entry's name. Optional: records minted earlier lack them.
  title?: string; // "LASTNAME, Firstname", as deposited
  authors?: string;
}

export type DoiMap = Record<string, DoiRecord>;

const DATA_DIR = path.resolve("src/data");

export function stateFile(env: string): string {
  return path.join(
    DATA_DIR,
    env === "sandbox" ? "zenodo-dois.sandbox.json" : "zenodo-dois.json",
  );
}

/** Read a map file. A missing file is an empty map (nothing minted yet). A
 *  malformed one THROWS — the file or any record in it: read as empty (or a
 *  record as missing), the mint would treat those entries as new, minting
 *  duplicate concept DOIs, and then save a map without the old records. */
export function readDoiMap(file: string): DoiMap {
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
  // Accept anything the mint itself can write — it saves `conceptDoi: ""` when
  // Zenodo's response lacks one, and the next new version fills it in.
  for (const [slug, rec] of Object.entries(parsed)) {
    const r = rec as Partial<DoiRecord> | null;
    if (
      !r ||
      typeof r !== "object" ||
      Array.isArray(r) ||
      typeof r.recordId !== "number" ||
      typeof r.conceptDoi !== "string"
    )
      throw new Error(
        `${name}: "${slug}" is not a DOI record (needs a numeric recordId and a string conceptDoi)`,
      );
  }
  return parsed as DoiMap;
}

/** Write a whole map, slug-sorted for stable diffs. Atomic (temp+rename) so a
 *  crash mid-write can't truncate the committed map and lose minted DOIs. */
export function writeDoiMap(file: string, map: DoiMap): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted: DoiMap = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(sorted, null, 2) + "\n");
  renameSync(tmp, file);
}

export function loadState(env: string): DoiMap {
  return readDoiMap(stateFile(env));
}

export function saveState(env: string, map: DoiMap): void {
  writeDoiMap(stateFile(env), map);
}

/** Slug-level 3-way merge, for committing a mint run's map onto a main that may
 *  have moved since the run started: start from main's map (`theirs`) and apply
 *  only the records this run changed (`ours` vs. the map it started from,
 *  `base`). A record committed by anyone else meanwhile is never overwritten or
 *  dropped. */
export function mergeDoiMaps(
  base: DoiMap,
  ours: DoiMap,
  theirs: DoiMap,
): DoiMap {
  const merged: DoiMap = { ...theirs };
  for (const [slug, rec] of Object.entries(ours))
    if (JSON.stringify(rec) !== JSON.stringify(base[slug])) merged[slug] = rec;
  return merged;
}
