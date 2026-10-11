// The mint's per-entry decision and Zenodo steps, apart from the CLI in
// scripts/zenodo-mint.ts (which runs on import), so tests can drive them with
// a fake client.
//
// A new entry gets its DOI in two phases, so that its FIRST PDF already cites
// it: `reserve` creates a draft with a reserved DOI and saves a "draft" record;
// the site is then rebuilt (the mint build counts the draft, see citeFor), and
// `publish` uploads the PDF that cites the reserved DOI and publishes the draft.
import type { Deposition, ZenodoClient } from "./zenodo-client.ts";
import { pruneDraftFiles } from "./zenodo-files.ts";
import { computeStateHash, versionLabel } from "./zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./zenodo-metadata.ts";
import type { DoiRecord } from "./zenodo-state.ts";

export type Env = "sandbox" | "production";
export type Action = "reserve" | "publish" | "newversion" | "skip";

export type MintClient = Pick<
  ZenodoClient,
  | "createDeposition"
  | "deleteDeposition"
  | "getDeposition"
  | "uploadFile"
  | "updateMetadata"
  | "publish"
  | "newVersion"
  | "listFiles"
  | "deleteFile"
>;

export interface MintLog {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

/** Extract the trailing numeric id from a `…/deposit/depositions/<id>` URL. */
export function idFromUrl(url: string): number {
  const m = url.match(/depositions\/(\d+)/);
  if (!m) throw new Error(`cannot parse deposition id from ${url}`);
  return Number(m[1]);
}

export const isDraft = (r?: DoiRecord) => r?.status === "draft";

export function decide(
  entry: MetaEntry,
  cfg: MetadataConfig,
  state?: DoiRecord,
  force = false,
): Action {
  // A reserved draft is always finished first, whatever --force says.
  if (isDraft(state)) return "publish";
  if (!state) return "reserve";
  if (force || state.contentHash !== computeStateHash(entry, cfg))
    return "newversion";
  return "skip";
}

export interface Deposit {
  filename: string;
  bytes: Buffer;
  metadata: Record<string, any>;
}

const httpStatus = (err: unknown) => (err as { status?: number })?.status;
const DOI_PREFIX: Record<Env, string> = {
  sandbox: "10.5072/",
  production: "10.5281/",
};

/**
 * Phase 1: create a draft that reserves its DOI. Returns the draft's ids and
 * the reserved DOI. The DOI is never derived: when the response lacks it, or
 * it does not belong to the draft or the env, the draft is deleted and this
 * throws.
 */
export async function reserveDraft(
  zen: MintClient,
  env: Env,
  log: MintLog,
): Promise<{ recordId: number; conceptRecId?: number; versionDoi: string }> {
  const draft = await zen.createDeposition({ prereserve_doi: true });
  const reserved = draft.metadata?.prereserve_doi;
  const problem = !reserved?.doi
    ? "the response has no reserved DOI"
    : Number(reserved.recid) !== draft.id
      ? `the reserved DOI belongs to record ${reserved.recid}, not to draft ${draft.id}`
      : !reserved.doi.startsWith(DOI_PREFIX[env])
        ? `the reserved DOI ${reserved.doi} is not a ${env} DOI`
        : "";
  if (problem) {
    try {
      await zen.deleteDeposition(draft.id);
    } catch (err) {
      if (httpStatus(err) !== 404)
        log.warn(
          `  could not delete draft ${draft.id}: ${(err as Error).message}`,
        );
    }
    throw new Error(`${problem}; deleted draft ${draft.id}`);
  }
  const conceptRecId =
    draft.conceptrecid != null && String(draft.conceptrecid) !== ""
      ? Number(draft.conceptrecid)
      : undefined;
  if (conceptRecId === undefined)
    log.warn(`  draft ${draft.id} has no concept record id`);
  return { recordId: draft.id, conceptRecId, versionDoi: reserved!.doi };
}

/**
 * Before a run publishes a draft reserved in an EARLIER run: is it still a
 * draft? "gone" (404/410) means the entry needs a new reservation;
 * "submitted" means an earlier run published it but stopped before it saved
 * the record. Other errors throw.
 */
export async function draftState(
  zen: MintClient,
  rec: DoiRecord,
): Promise<
  | { kind: "draft" }
  | { kind: "gone" }
  | { kind: "submitted"; published: Deposition }
> {
  let dep: Deposition;
  try {
    dep = await zen.getDeposition(rec.recordId);
  } catch (err) {
    const status = httpStatus(err);
    if (status === 404 || status === 410) return { kind: "gone" };
    throw err;
  }
  return dep.submitted === true
    ? { kind: "submitted", published: dep }
    : { kind: "draft" };
}

export type DraftOutcome =
  | { kind: "gone" }
  | { kind: "submitted"; published: Deposition }
  | { kind: "published"; published: Deposition };

/**
 * Phase 2: upload the PDF (which cites the reserved DOI) to the reserved
 * draft and publish it.
 * - "gone": the draft no longer exists (404/410). The record stays: the next
 *   run finds it gone (draftState) and reserves a new DOI.
 * - "submitted": the draft was already published (a run stopped before it
 *   saved the record); nothing is uploaded.
 */
export async function publishDraft(
  zen: MintClient,
  rec: DoiRecord,
  slug: string,
  { filename, bytes, metadata }: Deposit,
  log: MintLog,
): Promise<DraftOutcome> {
  let draft: Deposition;
  try {
    draft = await zen.getDeposition(rec.recordId);
  } catch (err) {
    const status = httpStatus(err);
    if (status === 404 || status === 410) return { kind: "gone" };
    throw err;
  }
  if (draft.submitted === true) return { kind: "submitted", published: draft };
  const bucket = draft.links.bucket;
  if (!bucket) throw new Error("no bucket link on the reserved draft");
  await zen.uploadFile(bucket, filename, bytes); // same filename overwrites
  await pruneDraftFiles(
    zen,
    rec.recordId,
    filename,
    (m) => log.warn(`  ! ${slug}: ${m}`),
    (m) => log.info(`  ${slug}: ${m}`),
  );
  await zen.updateMetadata(rec.recordId, metadata);
  return { kind: "published", published: await zen.publish(rec.recordId) };
}

/**
 * The published record must carry the DOI its PDF cites: the reserved DOI
 * (production), or for the sandbox the concept record. Returns the problem,
 * or null.
 */
export function publishedDoiProblem(
  rec: DoiRecord,
  published: Deposition,
  env: Env,
): string | null {
  if (published.doi !== rec.versionDoi)
    return `published DOI ${published.doi} is not the reserved ${rec.versionDoi}`;
  if (
    env === "sandbox" &&
    rec.conceptRecId != null &&
    Number(published.conceptrecid) !== rec.conceptRecId
  )
    return `published concept record ${published.conceptrecid} is not ${rec.conceptRecId}, which the PDF cites`;
  return null;
}

/**
 * The map record after a reserved draft was published (now or by an earlier
 * run). A published DOI is permanent, so the record always holds what Zenodo
 * published. The hash stays empty, so the next run makes a fresh version,
 * when the DOI is not the reserved one (`problem`) or when an earlier run
 * published the draft (its PDF was not checked by this run).
 */
export function recordAfterPublish(
  rec: DoiRecord,
  outcome: { kind: "published" | "submitted"; published: Deposition },
  entry: MetaEntry,
  cfg: MetadataConfig,
  env: Env,
  title: string,
): { record: DoiRecord; problem: string | null } {
  const { published } = outcome;
  const problem = publishedDoiProblem(rec, published, env);
  const hash =
    problem || outcome.kind === "submitted" ? "" : computeStateHash(entry, cfg);
  return {
    record: publishedRecord(
      entry,
      title,
      env,
      published,
      published.conceptdoi ?? "",
      hash,
    ),
    problem,
  };
}

/** Does the built print page link exactly this citation URL? */
export function citesRecord(html: string, url: string): boolean {
  return html.includes(`href="${url}"`);
}

/** The map record of a reserved, unpublished draft. */
export function draftRecord(
  entry: MetaEntry,
  title: string,
  env: Env,
  reserved: { recordId: number; conceptRecId?: number; versionDoi: string },
): DoiRecord {
  return {
    recordId: reserved.recordId,
    ...(reserved.conceptRecId !== undefined
      ? { conceptRecId: reserved.conceptRecId }
      : {}),
    conceptDoi: "",
    versionDoi: reserved.versionDoi,
    contentHash: "",
    status: "draft",
    version: versionLabel(entry.version),
    mintedAt: new Date().toISOString(),
    env,
    title,
    ...(entry.authors ? { authors: entry.authors } : {}),
  };
}

/** The map record of a published version. */
export function publishedRecord(
  entry: MetaEntry,
  title: string,
  env: Env,
  published: Deposition,
  conceptDoi: string,
  contentHash: string,
): DoiRecord {
  return {
    recordId: published.id,
    conceptRecId:
      published.conceptrecid != null
        ? Number(published.conceptrecid)
        : undefined,
    conceptDoi,
    versionDoi: published.doi ?? "",
    contentHash,
    status: "published",
    version: versionLabel(entry.version),
    mintedAt: new Date().toISOString(),
    env,
    title,
    ...(entry.authors ? { authors: entry.authors } : {}),
  };
}

/** A new version of the record `prev`. */
export async function newVersionOf(
  zen: MintClient,
  prev: DoiRecord,
  slug: string,
  { filename, bytes, metadata }: Deposit,
  log: MintLog,
): Promise<{ published: Deposition; conceptDoi: string }> {
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
    if (!draftUrl)
      throw new Error("no latest_draft link on newversion response");
    draftId = idFromUrl(draftUrl);
  } catch (err) {
    const rec = await zen.getDeposition(prev.recordId);
    const draftUrl = rec.links?.latest_draft;
    if (!draftUrl) throw err; // no draft to adopt — surface the real error
    draftId = idFromUrl(draftUrl);
    log.warn(
      `  ${slug}: newversion blocked (${(err as Error).message}); adopting existing draft ${draftId}`,
    );
  }

  const draft = await zen.getDeposition(draftId);
  const bucket = draft.links.bucket;
  if (!bucket) throw new Error("no bucket link on new-version draft");
  await zen.uploadFile(bucket, filename, bytes); // same filename overwrites
  // The draft starts with a copy of the previous version's files: drop
  // everything but the entry PDF (e.g. the legacy "<slug>.pdf").
  await pruneDraftFiles(
    zen,
    draftId,
    filename,
    (m) => log.warn(`  ! ${slug}: ${m}`),
    (m) => log.info(`  ${slug}: ${m}`),
  );
  await zen.updateMetadata(draftId, metadata);
  const published = await zen.publish(draftId);
  return { published, conceptDoi: published.conceptdoi ?? prev.conceptDoi };
}
