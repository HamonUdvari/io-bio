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
}

export type DoiMap = Record<string, DoiRecord>;

const DATA_DIR = path.resolve("src/data");

export function stateFile(env: string): string {
  return path.join(
    DATA_DIR,
    env === "sandbox" ? "zenodo-dois.sandbox.json" : "zenodo-dois.json",
  );
}

export function loadState(env: string): DoiMap {
  const f = stateFile(env);
  if (!existsSync(f)) return {};
  try {
    const parsed = JSON.parse(readFileSync(f, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as DoiMap) : {};
  } catch {
    return {};
  }
}

/** Write the whole map back, slug-sorted for stable diffs. Atomic (temp+rename)
 *  so a crash mid-write can't truncate the committed map and lose minted DOIs. */
export function saveState(env: string, map: DoiMap): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const sorted: DoiMap = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  const f = stateFile(env);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(sorted, null, 2) + "\n");
  renameSync(tmp, f);
}
