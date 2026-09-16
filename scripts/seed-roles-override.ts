// Seeds src/data/roles-override.json with every bio entry slug and an EMPTY
// roles array, so all entries appear (and stay in sync) in the CMS "Roles
// override" list. An empty roles array means "no override" — the entry's roles
// are auto-read from the Word file. Fill an entry's roles to REPLACE its table.
//
// Idempotent + merge-preserving: existing NON-EMPTY overrides are kept verbatim,
// so it is safe to re-run whenever a new .docx is added (new entries get an
// empty row; nothing else changes). Run: node scripts/seed-roles-override.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { slug as githubSlug } from "github-slugger";

const bioDir = path.resolve("src/content/bios");
const outPath = path.resolve("src/data/roles-override.json");

// Preserve any existing NON-EMPTY overrides across re-runs.
const existing: Record<string, unknown[]> = {};
if (existsSync(outPath)) {
  try {
    const prev = JSON.parse(readFileSync(outPath, "utf8")) as {
      overrides?: Array<{ slug?: string; roles?: unknown[] }>;
    };
    for (const o of prev?.overrides ?? []) {
      if (o?.slug && Array.isArray(o.roles) && o.roles.length) {
        existing[o.slug] = o.roles;
      }
    }
  } catch {
    // malformed existing file — reseed from scratch
  }
}

const slugs = readdirSync(bioDir)
  .filter((f) => f.toLowerCase().endsWith(".docx"))
  .map((f) => githubSlug(path.basename(f, path.extname(f))))
  .sort();

const out = {
  _comment:
    "Per-entry ROLES override. Empty roles => the roles are auto-read from the Word file. Fill roles to REPLACE the whole roles table for that entry. 'title' is required per row; organisation/abbreviation/startYear/endYear are optional. Edit in the CMS under Settings -> Roles override. Re-seed with: node scripts/seed-roles-override.ts",
  overrides: slugs.map((s) => ({ slug: s, roles: existing[s] ?? [] })),
};

writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(
  `roles-override: wrote ${slugs.length} entries (${Object.keys(existing).length} with an override) -> ${path.relative(process.cwd(), outPath)}`,
);
