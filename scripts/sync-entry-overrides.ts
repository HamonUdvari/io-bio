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
import sharp from "sharp";

// Keep in sync with DETAIL_FIELDS in src/loaders/docxLoader.ts (preview order).
const DETAIL_FIELDS = [
  "imageSource",
  "lastName",
  "firstName",
  "knownAs",
  "nee",
  "summary",
  "life",
  "nationality",
  "country",
  "version",
  "authors",
  "editors",
] as const;

const distFile = path.resolve("dist/entry-data.json");
if (!existsSync(distFile)) {
  console.error(
    "sync-entry-overrides: dist/entry-data.json not found — run `pnpm build` first.",
  );
  process.exit(1);
}
const outDir = path.resolve("src/data/entry-overrides");
mkdirSync(outDir, { recursive: true });

// Committed small-webp previews of each entry's active portrait, shown READ-ONLY
// in the CMS (CMS-display only; the site never reads these). Generated here from
// the build's active image so it lands in the same [skip ci] sync commit.
const portraitsDir = path.resolve("src/content/bios-portraits");
mkdirSync(portraitsDir, { recursive: true });
const activeDir = path.resolve("src/assets/bios");

const source = JSON.parse(readFileSync(distFile, "utf8")) as Array<{
  slug?: string;
  name?: string;
  roles?: unknown[];
  details?: Record<string, string>;
  imageFn?: string;
}>;

const wantSlugs = new Set<string>();
const portraitSlugs = new Set<string>();
let portraitsWritten = 0;
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

  // details: PER FIELD — mirror the live value when its <field>Override flag is
  // OFF; preserve the manual value when ON. Flags are always preserved. Emit
  // value + flag interleaved (in preview order) so the CMS card shows each field
  // next to its Override checkbox.
  const prevDetails =
    prev.details && typeof prev.details === "object"
      ? (prev.details as Record<string, unknown>)
      : {};
  const details: Record<string, string | boolean> = {};
  for (const k of DETAIL_FIELDS) {
    const overridden = prevDetails[`${k}Override`] === true;
    details[k] = overridden
      ? typeof prevDetails[k] === "string"
        ? (prevDetails[k] as string)
        : ""
      : (e?.details?.[k] ?? "");
    details[`${k}Override`] = overridden;
  }

  // Read-only "current portrait" preview: a small webp of the active image
  // (imageFn = the Word photo, or the override if set). Written only when the
  // bytes differ (idempotent). Reconcile deletes it if the entry loses its image.
  let wordPortrait = "";
  const imageFn = String(e?.imageFn ?? "").trim();
  const activeImg = imageFn ? path.join(activeDir, imageFn) : "";
  if (activeImg && existsSync(activeImg)) {
    const webpPath = path.join(portraitsDir, `${slug}.webp`);
    try {
      const buf = await sharp(activeImg)
        .resize(320, null, { withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      if (!existsSync(webpPath) || !readFileSync(webpPath).equals(buf)) {
        writeFileSync(webpPath, buf);
        portraitsWritten++;
      }
      wordPortrait = `/src/content/bios-portraits/${slug}.webp`;
      portraitSlugs.add(slug);
    } catch (err) {
      console.warn(
        `  ! portrait webp failed for ${slug}: ${(err as Error).message}`,
      );
    }
  }

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
    wordPortrait,
    portraitImage:
      typeof prev.portraitImage === "string" ? prev.portraitImage : "",
    facePosition: Number.isFinite(fp) && fp >= 1 ? fp : null,
    details,
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

// Reconcile portrait previews: delete a webp whose entry is gone or lost its image.
let portraitsDeleted = 0;
for (const f of readdirSync(portraitsDir)) {
  if (!f.toLowerCase().endsWith(".webp")) continue;
  if (!portraitSlugs.has(path.basename(f, ".webp"))) {
    unlinkSync(path.join(portraitsDir, f));
    portraitsDeleted++;
  }
}

console.log(
  `entry-overrides: ${created} created, ${updated} updated, ${deleted} deleted, ${wantSlugs.size} total.`,
);
console.log(
  `portraits: ${portraitsWritten} written, ${portraitsDeleted} deleted, ${portraitSlugs.size} total.`,
);
