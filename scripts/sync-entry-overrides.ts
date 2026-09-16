// Reconciles src/data/entry-overrides/<slug>.json 1:1 with the bio entries. It
// reads dist/entry-roles.json (emitted by src/pages/entry-roles.json.ts during a
// build) — reusing the real content loader so the mirrored roles are exactly what
// the site renders. For each entry it MIRRORS the Word-parsed roles + a display
// name (so the CMS shows real data), while PRESERVING the manual fields
// (rolesOverride, override roles, portraitImage, facePosition). Override files
// whose entry no longer exists are DELETED (a removed .docx cleans up its CMS
// override). Idempotent.
//
//   Run: pnpm build && node scripts/sync-entry-overrides.ts   (npm: pnpm overrides:sync)
//
// The build (docxLoader.ts) reads these files: rolesOverride:true => the roles
// here REPLACE the Word roles; otherwise roles are read live from the Word file
// and the `roles` here is only the CMS's WYSIWYG mirror.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const distFile = path.resolve("dist/entry-roles.json");
if (!existsSync(distFile)) {
  console.error(
    "sync-entry-overrides: dist/entry-roles.json not found — run `pnpm build` first.",
  );
  process.exit(1);
}
const outDir = path.resolve("src/data/entry-overrides");
mkdirSync(outDir, { recursive: true });

const source = JSON.parse(readFileSync(distFile, "utf8")) as Array<{
  slug?: string;
  name?: string;
  roles?: unknown[];
}>;

const wantSlugs = new Set<string>();
let created = 0;
let updated = 0;

for (const e of source) {
  const slug = String(e?.slug ?? "").trim();
  if (!slug) continue;
  wantSlugs.add(slug);
  const outPath = path.join(outDir, `${slug}.json`);

  // Preserve manual fields from an existing file.
  let prev: Record<string, unknown> = {};
  if (existsSync(outPath)) {
    try {
      prev = JSON.parse(readFileSync(outPath, "utf8"));
    } catch {
      /* malformed — treat as empty */
    }
  }
  const rolesOverride = prev.rolesOverride === true;
  const fp = Number(prev.facePosition);

  const next = {
    slug,
    name: String(e?.name ?? prev.name ?? slug),
    rolesOverride,
    // When overriding, keep the manual roles; otherwise mirror the live roles.
    roles: rolesOverride
      ? Array.isArray(prev.roles)
        ? prev.roles
        : []
      : Array.isArray(e?.roles)
        ? e.roles
        : [],
    portraitImage:
      typeof prev.portraitImage === "string" ? prev.portraitImage : "",
    facePosition: Number.isFinite(fp) && fp >= 1 ? fp : null,
  };

  const serialized = JSON.stringify(next, null, 2) + "\n";
  const existed = existsSync(outPath);
  if (!existed || readFileSync(outPath, "utf8") !== serialized) {
    writeFileSync(outPath, serialized);
    if (existed) updated++;
    else created++;
  }
}

// Reconcile: delete override files whose entry no longer exists.
let deleted = 0;
for (const f of readdirSync(outDir)) {
  if (!f.toLowerCase().endsWith(".json")) continue;
  if (!wantSlugs.has(path.basename(f, ".json"))) {
    unlinkSync(path.join(outDir, f));
    deleted++;
  }
}

console.log(
  `entry-overrides: ${created} created, ${updated} updated, ${deleted} deleted, ${wantSlugs.size} total.`,
);
