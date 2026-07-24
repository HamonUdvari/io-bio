// Per-entry Zenodo DOI minter (sandbox-first).
//
//   node scripts/zenodo-mint.ts [--env sandbox|production] [--limit N]
//        [--only slugA,slugB] [--dry-run] [--yes-production]
//
// Reads dist/zenodo-meta.json (produced by `astro build` via the
// src/pages/zenodo-meta.json.ts endpoint), decides create / new-version / skip
// per entry by content hash, renders the entry PDF artifact, deposits to Zenodo,
// and records the result in src/data/zenodo-dois[.sandbox].json.
//
// Token: ZENODO_TOKEN (scopes deposit:write + deposit:actions). dry-run needs none.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createZenodoClient } from "./lib/zenodo-client.ts";
import type { Deposition } from "./lib/zenodo-client.ts";
import {
  buildMetadata,
  computeStateHash,
  versionLabel,
} from "./lib/zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./lib/zenodo-metadata.ts";
import { loadState, saveState } from "./lib/zenodo-state.ts";
import type { DoiRecord } from "./lib/zenodo-state.ts";
import { renderPdfs } from "./zenodo-render-pdfs.ts";

const SITE = (process.env.SITE_URL ?? "https://HamonUdvari.github.io").replace(/\/$/, "");
const BASE = (process.env.SITE_BASE ?? "/io-bio").replace(/\/$/, "");
// Closest STANDARD license to the current IO BIO terms (all-rights-reserved,
// NC-educational by permission). Editors sign off before the production mint.
const LICENSE = process.env.ZENODO_LICENSE ?? "cc-by-nc-nd-4.0";
const LICENSE_LABEL = process.env.ZENODO_LICENSE_LABEL ?? "CC BY-NC-ND 4.0";
const PUBLICATION_TYPE = process.env.ZENODO_PUBLICATION_TYPE ?? "section";

// The dictionary each entry belongs to. Expressed as bibliographic "Book section"
// metadata (partof_title + imprint + editors) rather than a whole-work/software
// DOI, plus an isPartOf link to the dictionary's home URL. io-bio.ch is the
// intended permanent home (env-overridable until the domain is live).
const DICTIONARY_HOME_URL = (
  process.env.DICTIONARY_HOME_URL ?? "https://io-bio.ch"
).replace(/\/$/, "");
const PARTOF_TITLE =
  process.env.ZENODO_PARTOF_TITLE ??
  "IO BIO, Biographical Dictionary of Secretaries-General of International Organizations";
const IMPRINT_PUBLISHER =
  process.env.ZENODO_IMPRINT_PUBLISHER ?? "IO BIO Project, Radboud University Nijmegen";
const IMPRINT_PLACE = process.env.ZENODO_IMPRINT_PLACE ?? "Nijmegen, Netherlands";

// Dictionary editors → Zenodo `contributors` (type "Editor"); matches the on-site
// "How to cite" ("edited by Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg").
const EDITORS = [
  { name: "Reinalda, Bob", type: "Editor", affiliation: "Radboud University, Nijmegen, Netherlands" },
  { name: "Kille, Kent J.", type: "Editor", affiliation: "The College of Wooster, United States" },
  { name: "Eisenberg, Jaci L.", type: "Editor", affiliation: "Geneva, Switzerland" },
];

// Rights/colophon note mirrored onto each record's `notes` (and shown in-document
// on the entry/PDF): the license covers the TEXT; the embedded portrait stays
// under its credited source. Keep in sync with the footnote in EntryArticle.astro.
const RIGHTS_NOTE =
  process.env.ZENODO_RIGHTS_NOTE ??
  `Text © the author(s), licensed under ${LICENSE_LABEL}. The portrait is excluded ` +
    `and remains under the rights of its credited source.`;

// Files + dirs that determine the rendered PDF's VISUAL output: the Paged.js
// print route, the article template + its helpers (Image, displayName), the
// stylesheet, the Astro/Vite config, and the remark/rehype plugins that
// transform the biography-body markdown into the rendered HTML. Hashing them all
// gives a "render version" that, folded into the SANDBOX idempotency hash, makes
// a layout/template change re-version the demo deposits — no manual --force, and
// kept in sync with the paths filter in .github/workflows/zenodo-sandbox-refresh.yml.
// NOTE: webfont glyph files live in node_modules and are intentionally NOT
// hashed (a font-version bump won't re-version); and global.css is the whole
// stylesheet, so a screen-only edit harmlessly over-triggers a sandbox re-version.
const PRINT_TEMPLATE_FILES = [
  "src/styles/global.css",
  "src/pages/print/[slug].astro",
  "src/components/EntryArticle.astro",
  "src/components/Image.astro",
  "src/utils/displayName.ts",
  "astro.config.mjs",
];
const PRINT_TEMPLATE_DIRS = ["src/remarkPlugins", "src/rehypePlugins"];

function printTemplateVersion(): string {
  const files = [...PRINT_TEMPLATE_FILES];
  for (const d of PRINT_TEMPLATE_DIRS) {
    const dp = path.resolve(d);
    if (existsSync(dp))
      for (const name of readdirSync(dp)) files.push(path.posix.join(d, name));
  }
  const h = createHash("sha256");
  for (const f of files.sort()) {
    const p = path.resolve(f);
    const content =
      existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : "";
    h.update(`${f}\0${content}\0`);
  }
  return h.digest("hex").slice(0, 16);
}

type Action = "create" | "newversion" | "skip";

interface Args {
  env: "sandbox" | "production";
  limit?: number;
  only?: string[];
  dryRun: boolean;
  yesProduction: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { env: "sandbox", dryRun: false, yesProduction: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") a.env = argv[++i] === "production" ? "production" : "sandbox";
    else if (arg === "--limit") a.limit = Number(argv[++i]);
    else if (arg === "--only") {
      const v = argv[++i] ?? "";
      a.only = v.split(",").map((s) => s.trim()).filter(Boolean);
    }
    else if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--yes-production") a.yesProduction = true;
    // Force a new version for every (already-minted) entry regardless of the
    // content hash — used to re-render all artifacts after a layout/template
    // change (the content hash is content-only, so a pure-layout change like the
    // Paged.js redesign would otherwise be skipped).
    else if (arg === "--force") a.force = true;
  }
  if (process.env.ZENODO_ENV === "sandbox") a.env = "sandbox";
  return a;
}

function readMeta(): MetaEntry[] {
  const f = path.resolve("dist/zenodo-meta.json");
  if (!existsSync(f))
    throw new Error(
      "dist/zenodo-meta.json not found — run `npm run build` first (it emits the metadata endpoint).",
    );
  return JSON.parse(readFileSync(f, "utf8")) as MetaEntry[];
}

/** Extract the trailing numeric id from a `…/deposit/depositions/<id>` URL. */
function idFromUrl(url: string): number {
  const m = url.match(/depositions\/(\d+)/);
  if (!m) throw new Error(`cannot parse deposition id from ${url}`);
  return Number(m[1]);
}

function decide(
  entry: MetaEntry,
  cfg: MetadataConfig,
  state?: DoiRecord,
  force = false,
): Action {
  const hash = computeStateHash(entry, cfg);
  if (!state) return "create";
  if (force || state.contentHash !== hash) return "newversion";
  return "skip";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.env === "production" && !args.yesProduction) {
    console.error(
      "Refusing to mint PRODUCTION DOIs without --yes-production. Production DOIs are permanent.\n" +
        `Before producing real DOIs: confirm the editors have signed off on the license (${LICENSE}), ` +
        "lock the entry slugs, point SITE_URL at the live domain, and re-run with --yes-production.",
    );
    process.exit(1);
  }

  const baseUrl =
    args.env === "sandbox"
      ? "https://sandbox.zenodo.org/api"
      : "https://zenodo.org/api";

  const cfg: MetadataConfig = {
    license: LICENSE,
    dictionaryHomeUrl: DICTIONARY_HOME_URL,
    partofTitle: PARTOF_TITLE,
    imprintPublisher: IMPRINT_PUBLISHER,
    imprintPlace: IMPRINT_PLACE,
    editors: EDITORS,
    entryUrl: (slug) => `${SITE}${BASE}/entries/${slug}`,
    rightsNote: RIGHTS_NOTE,
    publicationType: PUBLICATION_TYPE,
    // SANDBOX only: fold the print-template fingerprint into the idempotency
    // hash so a layout/CSS change re-versions the demo deposits. Production stays
    // content-only — a cosmetic change must never churn permanent DOIs.
    renderVersion: args.env === "sandbox" ? printTemplateVersion() : undefined,
  };

  let meta = readMeta();
  if (args.only) {
    const set = new Set(args.only);
    meta = meta.filter((e) => set.has(e.slug));
    const missing = args.only.filter((s) => !meta.find((e) => e.slug === s));
    if (missing.length) console.warn(`--only: not found in meta: ${missing.join(", ")}`);
  }
  if (args.limit !== undefined) {
    if (!Number.isFinite(args.limit) || args.limit <= 0) {
      console.error(`--limit must be a positive number (got "${args.limit}").`);
      process.exit(1);
    }
    meta = meta.slice(0, args.limit);
  }

  const state = loadState(args.env);

  // Plan
  const plan = meta.map((e) => ({
    e,
    action: decide(e, cfg, state[e.slug], args.force),
  }));
  const counts = { create: 0, newversion: 0, skip: 0 };
  for (const p of plan) counts[p.action]++;

  console.log(
    `\nZenodo mint — env=${args.env}  license=${LICENSE}  entries=${meta.length}  ` +
      `(create=${counts.create}, newversion=${counts.newversion}, skip=${counts.skip})\n`,
  );

  if (args.dryRun) {
    for (const { e, action } of plan) {
      const { metadata, warnings } = buildMetadata(e, cfg);
      console.log(`• ${action.toUpperCase().padEnd(10)} ${e.slug}`);
      if (action !== "skip") {
        console.log(`    title:   ${metadata.title}`);
        console.log(`    authors: ${metadata.creators.map((c) => c.name).join("; ")}`);
        console.log(`    editors: ${(metadata.contributors ?? []).map((c) => c.name).join("; ") || "—"}`);
        console.log(`    type:    ${metadata.publication_type}  license: ${metadata.license}`);
        console.log(`    partOf:  ${metadata.partof_title ?? "—"}`);
        console.log(`    date:    ${metadata.publication_date}  version: ${metadata.version ?? "—"}`);
        console.log(
          `    rels:    ${metadata.related_identifiers.map((r) => `${r.relation}→${r.identifier}`).join("  ")}`,
        );
        for (const w of warnings) console.log(`    ! ${w}`);
      }
    }
    console.log("\n(dry run — no network writes, no state changes)");
    return;
  }

  const token = process.env.ZENODO_TOKEN ?? "";
  if (!token) throw new Error("ZENODO_TOKEN is not set (needs scopes deposit:write + deposit:actions).");
  const zen = createZenodoClient({ baseUrl, token });

  const todo = plan.filter((p) => p.action !== "skip");
  if (todo.length === 0) {
    console.log("Nothing to do — all selected entries are up to date.");
    return;
  }

  // Render PDFs only for the entries we will (re)deposit.
  console.log(`Rendering ${todo.length} entry PDF(s)…`);
  const pdfs = await renderPdfs(todo.map((p) => p.e.slug));

  let ok = 0;
  let failed = 0;
  for (const { e, action } of todo) {
    const pdfPath = pdfs.get(e.slug);
    if (!pdfPath || !existsSync(pdfPath)) {
      console.error(`✗ ${e.slug}: missing rendered PDF — skipping`);
      failed++;
      continue;
    }
    const { metadata, warnings } = buildMetadata(e, cfg);
    for (const w of warnings) console.warn(`  ! ${e.slug}: ${w}`);
    const bytes = readFileSync(pdfPath);
    // The file Zenodo shows/serves gets an "-iobio" suffix so a downloaded
    // deposit is identifiable out of context (e.g. lie-th-2017-iobio.pdf),
    // matching the site's Download button (see the entry page's `download`
    // attribute). The local rendered path keeps the plain <slug>.pdf name.
    const filename = `${e.slug}-iobio.pdf`;

    try {
      let published: Deposition;
      let conceptDoi: string;

      if (action === "create") {
        // Create a draft reserving the DOI; metadata is set authoritatively by
        // the updateMetadata call below (not duplicated in the create body).
        const draft = await zen.createDeposition({ prereserve_doi: true });
        const bucket = draft.links.bucket;
        if (!bucket) throw new Error("no bucket link on draft");
        await zen.uploadFile(bucket, filename, bytes);
        await zen.updateMetadata(draft.id, metadata);
        published = await zen.publish(draft.id);
        conceptDoi = published.conceptdoi ?? draft.conceptdoi ?? "";
      } else {
        // new version of an existing record
        const prev = state[e.slug];

        // Resolve the new-version draft's id. Normally newVersion() creates the
        // draft and returns its latest_draft link. But a run interrupted between
        // creating that draft and publishing it leaves a dangling unpublished
        // draft, and Zenodo then refuses to open another ("files.enabled: Please
        // remove all files first"). In that case ADOPT the existing draft (via
        // the record's latest_draft) and finish publishing it — safe and
        // idempotent: it completes the SAME version rather than minting a second
        // one. We deliberately don't discard + recreate: the discard/newversion
        // race reproduces the same 400. Never fall back to links.self — that's
        // the already-published original record.
        let draftId: number;
        try {
          const nv = await zen.newVersion(prev.recordId);
          const draftUrl = nv.links?.latest_draft;
          if (!draftUrl) throw new Error("no latest_draft link on newversion response");
          draftId = idFromUrl(draftUrl);
        } catch (err) {
          const rec = await zen.getDeposition(prev.recordId);
          const draftUrl = rec.links?.latest_draft;
          if (!draftUrl) throw err; // no draft to adopt — surface the real error
          draftId = idFromUrl(draftUrl);
          console.warn(
            `  ${e.slug}: newversion blocked (${(err as Error).message}); adopting existing draft ${draftId}`,
          );
        }

        const draft = await zen.getDeposition(draftId);
        const bucket = draft.links.bucket;
        if (!bucket) throw new Error("no bucket link on new-version draft");
        await zen.uploadFile(bucket, filename, bytes); // same filename overwrites
        await zen.updateMetadata(draftId, metadata);
        published = await zen.publish(draftId);
        conceptDoi = published.conceptdoi ?? prev.conceptDoi;
      }

      const record: DoiRecord = {
        recordId: published.id,
        conceptRecId:
          published.conceptrecid != null ? Number(published.conceptrecid) : undefined,
        conceptDoi,
        versionDoi: published.doi ?? "",
        contentHash: computeStateHash(e, cfg),
        status: "published",
        version: versionLabel(e.version),
        mintedAt: new Date().toISOString(),
        env: args.env,
      };
      state[e.slug] = record;
      saveState(args.env, state); // persist after every successful entry
      ok++;
      console.log(`✓ ${action} ${e.slug} → version ${record.versionDoi} (concept ${record.conceptDoi})`);
    } catch (err) {
      failed++;
      console.error(`✗ ${e.slug}: ${(err as Error).message}`);
      // leave state[slug] untouched so this entry retries on the next run
    }
  }

  console.log(`\nDone: ${ok} minted/updated, ${failed} failed. State: ${args.env}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
