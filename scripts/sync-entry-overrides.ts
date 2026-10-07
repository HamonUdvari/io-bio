// Reconciles src/data/entry-overrides/<slug>.json 1:1 with the bio entries. It
// reads dist/entry-data.json (emitted by src/pages/entry-data.json.ts during a
// build) — reusing the real content loader so the mirrored roles are exactly what
// the site renders. For each entry it MIRRORS the Word-parsed roles + a display
// name (so the CMS shows real data), while PRESERVING the manual fields
// (rolesOverride, override roles, portraitImage, facePosition, detail overrides).
// Idempotent.
//
// Deleted entries are ARCHIVED, never thrown away: when a .docx is removed, its
// card moves to src/data/entry-overrides-archive/<slug>.json (outside the CMS
// folder, so editors don't see it). When the same .docx is uploaded again, the
// card moves back, so its manual overrides survive a delete + re-add. (docxLoader
// also reads the archive as a fallback, so even the first deploy after a
// re-upload — before this sync runs — keeps the overrides.) Portrait uploads are
// never moved: they stay in src/content/bios-images, so a restored card still
// finds its file, and an editor can re-pick the photo for a renamed entry.
// An archived card is never overwritten: a superseded copy is kept in
// src/data/entry-overrides-archive/history/.
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

// Archive for deleted entries' cards (see header). Always created, even empty, so
// the CI step's `git add` of it never fails on a missing pathspec — git errors on
// a path that is neither on disk nor tracked (e.g. before any entry is deleted).
const archiveDir = path.resolve("src/data/entry-overrides-archive");
const historyDir = path.join(archiveDir, "history");
mkdirSync(archiveDir, { recursive: true });

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
let restored = 0;
let archived = 0;
let superseded = 0;

/** A card's JSON as a plain object, or null when it can't be read as one (bad
 *  JSON, null, an array). The caller then keeps the file in history rather than
 *  silently replacing it — never crash the sync, never lose a hand-edited card. */
function readCard(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Keep a superseded or unreadable card in history instead of overwriting or
 *  deleting it. Names are unique even when one run moves several for a slug. */
function moveToHistory(file: string, slug: string, kind: string): void {
  mkdirSync(historyDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let dest = path.join(historyDir, `${slug}.${stamp}.${kind}.json`);
  for (let i = 2; existsSync(dest); i++)
    dest = path.join(historyDir, `${slug}.${stamp}.${kind}-${i}.json`);
  renameSync(file, dest);
  superseded++;
}

for (const e of source) {
  const slug = String(e?.slug ?? "").trim();
  if (!slug) continue;
  wantSlugs.add(slug);
  const outPath = path.join(outDir, `${slug}.json`);
  const archivedPath = path.join(archiveDir, `${slug}.json`);

  // Preserve manual fields from the existing card — or, for an entry that is back
  // after a deletion, from its archived card.
  let prev: Record<string, unknown> = {};
  let fromArchive = false;
  if (existsSync(outPath)) {
    const live = readCard(outPath);
    if (live) prev = live;
    // An unreadable live card is kept in history, then rebuilt from Word below.
    else moveToHistory(outPath, slug, "live-unreadable");
    // An archived copy next to a live card is stale (the live card wins) — e.g. a
    // card re-saved by hand while its .docx was gone. Keep it, out of the way.
    if (existsSync(archivedPath))
      moveToHistory(archivedPath, slug, "archived-stale");
  } else if (existsSync(archivedPath)) {
    const card = readCard(archivedPath);
    if (card) {
      prev = card;
      fromArchive = true;
    } else {
      // Unreadable archived card: keep it in history and start a fresh card.
      moveToHistory(archivedPath, slug, "archived-unreadable");
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
    else if (fromArchive) restored++;
    else created++;
  }
  if (fromArchive) unlinkSync(archivedPath);
}

// Reconcile: ARCHIVE the card of an entry whose .docx is gone (never a plain
// delete). Its portrait upload stays where it is. If an archived card already
// exists for that slug, keep the older copy in history rather than overwrite it.
for (const f of readdirSync(outDir)) {
  if (!f.toLowerCase().endsWith(".json")) continue;
  const slug = path.basename(f, ".json");
  if (wantSlugs.has(slug)) continue;
  const cardPath = path.join(outDir, f);
  const dest = path.join(archiveDir, f);
  if (existsSync(dest)) {
    if (readFileSync(dest, "utf8") === readFileSync(cardPath, "utf8")) {
      unlinkSync(cardPath); // identical copy already archived
      archived++;
      continue;
    }
    moveToHistory(dest, slug, "archived-superseded");
  }
  renameSync(cardPath, dest);
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
if (superseded)
  console.log(
    `archive: ${superseded} superseded/unreadable card(s) kept in history.`,
  );
console.log(
  `portraits: ${portraitsWritten} written, ${portraitsDeleted} deleted, ${portraitSlugs.size} total.`,
);
