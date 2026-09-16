// Shared role-normalisation transforms, used by BOTH the build (docxLoader.ts)
// and the CMS sync script (scripts/sync-entry-overrides.ts). Keeping a single
// copy guarantees the CMS "mirror from Word" preview is byte-identical to what
// the site renders — if these two ever diverged, the WYSIWYG would silently lie.
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

// --- Organisation acronym map (src/data/org-abbreviations.json) --------------
// Canonical organisation full-name → acronym, editable in the CMS (Settings →
// Organization acronyms). FILLS a role's abbreviation when the docx named the
// organisation but not its "(ACRONYM)". Fill-only: an abbreviation already parsed
// from the docx always wins. Matching ignores case + extra spaces. Keys starting
// with "_" (e.g. "_comment") are never org names, so they're skipped.
export function normalizeOrgKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function loadOrgAbbrMap(): Record<string, string> {
  const p = path.resolve("./src/data", "org-abbreviations.json");
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const map: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw ?? {})) {
      if (name.startsWith("_")) continue;
      const abbr = String(value ?? "").trim();
      if (abbr) map[normalizeOrgKey(name)] = abbr;
    }
    return map;
  } catch {
    return {};
  }
}
export const ORG_ABBR_MAP = loadOrgAbbrMap();

/** Fill a role's missing abbreviation from the canonical org→acronym map. */
export function fillRoleAbbr<
  T extends { organisation?: string; abbreviation?: string },
>(role: T): T {
  if (role.abbreviation || !role.organisation) return role;
  const abbr = ORG_ABBR_MAP[normalizeOrgKey(role.organisation)];
  return abbr ? { ...role, abbreviation: abbr } : role;
}

// Authors naturally spell an organisation out on first mention — "Secretary of
// the European Commission of the Danube (ECD)" — then use only the acronym after
// — "Secretary-General of the ECD". The parser then leaves the later role with
// `organisation: "ECD"` and no full name, so the org column shows a bare "ECD".
// Backfill that later role's full name from the EARLIER role in the SAME entry
// that already defined the acronym. This touches only the roles array (the org
// column + search index); the summary prose at the top of the bio is untouched,
// so we never force the author to repeat the full name and read clumsily.
export function expandAcronymOrgs<
  T extends { organisation?: string; abbreviation?: string },
>(roles: T[]): T[] {
  // Map each acronym to the full name a role spelled out. If the SAME acronym
  // maps to two DIFFERENT full names within one entry (e.g. "EC" used for two
  // bodies), it is ambiguous — skip it rather than silently pick one.
  const fullByAbbr: Record<string, string> = {};
  const ambiguous = new Set<string>();
  for (const r of roles) {
    if (r.abbreviation && r.organisation && r.organisation !== r.abbreviation) {
      const prev = fullByAbbr[r.abbreviation];
      if (prev && prev !== r.organisation) ambiguous.add(r.abbreviation);
      else fullByAbbr[r.abbreviation] = r.organisation;
    }
  }
  if (!Object.keys(fullByAbbr).length) return roles;
  return roles.map((r) => {
    if (!r.organisation || ambiguous.has(r.organisation)) return r;
    const full = fullByAbbr[r.organisation];
    if (!full || full === r.organisation) return r;
    return {
      ...r,
      organisation: full,
      abbreviation: r.abbreviation || r.organisation,
    };
  });
}
