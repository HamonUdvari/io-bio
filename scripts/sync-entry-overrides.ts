// Reconciles src/data/entry-overrides/<slug>.json 1:1 with the bio entries. It
// reads dist/entry-data.json (emitted by src/pages/entry-data.json.ts during a
// build) — reusing the real content loader so the mirrored roles are exactly what
// the site renders. For each entry it MIRRORS the Word-parsed roles + a display
// name (so the CMS shows real data), while PRESERVING the manual fields
// (rolesOverride, override roles, portraitImage, facePosition, detail overrides).
// Idempotent.
//
// Deleted entries are ARCHIVED, never thrown away: when a .docx is removed, its
// card moves to src/data/entry-overrides-archive/<slug>.json and its portrait
// upload to src/data/entry-overrides-archive/images/<slug>/ (outside every CMS
// folder, so editors don't see them). When the same .docx is uploaded again,
// both move back, so the manual overrides and the upload survive a delete +
// re-add. (docxLoader also reads the archive as a fallback, so even the first
// deploy after a re-upload — before this sync runs — keeps the overrides.)
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
  renameSync,
  rmdirSync,
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

// Portrait-override uploads, and the archive for deleted entries (see header).
const imagesDir = path.resolve("src/content/bios-images");
const archiveDir = path.resolve("src/data/entry-overrides-archive");
const archiveImagesDir = path.join(archiveDir, "images");
const resolveUpload = (p: string) => path.resolve(p.replace(/^\/+/, ""));
const webPath = (abs: string) =>
  "/" + path.relative(process.cwd(), abs).split(path.sep).join("/");
const isInside = (abs: string, dir: string) => abs.startsWith(dir + path.sep);

const source = JSON.parse(readFileSync(distFile, "utf8")) as Array<{
  slug?: string;
  name?: string;
  roles?: unknown[];
  details?: Record<string, string>;
  imageFn?: string;
}>;

const wantSlugs = new Set<string>();
const portraitSlugs = new Set<string>();
const keptImages = new Set<string>(); // uploads still used by a live card
let portraitsWritten = 0;
let created = 0;
let updated = 0;
let restored = 0;
let archived = 0;
let uploadsArchived = 0;
let uploadsRestored = 0;

/** Move a deleted entry's upload into the archive; returns the card's new path.
 *  Only an existing upload inside bios-images that no live card still uses is
 *  moved — the path comes from CMS-edited JSON, so nothing else is ever touched. */
function archiveUpload(slug: string, p: string): string {
  const abs = resolveUpload(p);
  if (!isInside(abs, imagesDir) || keptImages.has(abs) || !existsSync(abs)) return p;
  const dest = path.join(archiveImagesDir, slug, path.basename(abs));
  mkdirSync(path.dirname(dest), { recursive: true });
  renameSync(abs, dest);
  uploadsArchived++;
  return webPath(dest);
}

/** Move an archived upload back into bios-images; returns the card's new path.
 *  If the name was taken in the meantime, keep using the archived copy. */
function restoreUpload(p: string): string {
  const abs = resolveUpload(p);
  if (!isInside(abs, archiveImagesDir) || !existsSync(abs)) return p;
  const dest = path.join(imagesDir, path.basename(abs));
  if (existsSync(dest)) return p;
  mkdirSync(imagesDir, { recursive: true });
  renameSync(abs, dest);
  try {
    rmdirSync(path.dirname(abs)); // drop the now-empty images/<slug>/ folder
  } catch {
    /* not empty — keep it */
  }
  uploadsRestored++;
  return webPath(dest);
}

for (const e of source) {
  const slug = String(e?.slug ?? "").trim();
  if (!slug) continue;
  wantSlugs.add(slug);
  const outPath = path.join(outDir, `${slug}.json`);

  // Preserve manual fields from the existing card — or, for an entry that is back
  // after a deletion, from its archived card (moving its upload back too).
  let prev: Record<string, unknown> = {};
  let archivedCard = "";
  if (existsSync(outPath)) {
    try {
      prev = JSON.parse(readFileSync(outPath, "utf8"));
    } catch {
      /* malformed — treat as empty */
    }
  } else if (existsSync(path.join(archiveDir, `${slug}.json`))) {
    archivedCard = path.join(archiveDir, `${slug}.json`);
    try {
      prev = JSON.parse(readFileSync(archivedCard, "utf8"));
    } catch {
      /* malformed — start fresh */
    }
    if (typeof prev.portraitImage === "string" && prev.portraitImage)
      prev.portraitImage = restoreUpload(prev.portraitImage);
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

  if (next.portraitImage) keptImages.add(resolveUpload(next.portraitImage));

  const serialized = JSON.stringify(next, null, 2) + "\n";
  const existed = existsSync(outPath);
  if (!existed || readFileSync(outPath, "utf8") !== serialized) {
    writeFileSync(outPath, serialized);
    if (existed) updated++;
    else if (archivedCard) restored++;
    else created++;
  }
  if (archivedCard) unlinkSync(archivedCard);
}

// Reconcile: ARCHIVE the card of an entry whose .docx is gone (never a plain
// delete), together with its portrait upload unless a live card still uses it.
for (const f of readdirSync(outDir)) {
  if (!f.toLowerCase().endsWith(".json")) continue;
  const slug = path.basename(f, ".json");
  if (wantSlugs.has(slug)) continue;
  const cardPath = path.join(outDir, f);
  const dest = path.join(archiveDir, f);
  mkdirSync(archiveDir, { recursive: true });
  let card: Record<string, unknown> | null = null;
  try {
    card = JSON.parse(readFileSync(cardPath, "utf8"));
  } catch {
    /* malformed — archive the file as-is */
  }
  if (card) {
    if (typeof card.portraitImage === "string" && card.portraitImage.trim())
      card.portraitImage = archiveUpload(slug, card.portraitImage.trim());
    writeFileSync(dest, JSON.stringify(card, null, 2) + "\n");
    unlinkSync(cardPath);
  } else {
    renameSync(cardPath, dest);
  }
  archived++;
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
  `entry-overrides: ${created} created, ${updated} updated, ${restored} restored, ${archived} archived, ${wantSlugs.size} total.`,
);
console.log(
  `portrait uploads: ${uploadsArchived} archived, ${uploadsRestored} restored.`,
);
console.log(
  `portraits: ${portraitsWritten} written, ${portraitsDeleted} deleted, ${portraitSlugs.size} total.`,
);
