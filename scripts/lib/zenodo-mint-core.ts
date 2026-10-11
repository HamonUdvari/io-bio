// The mint's per-entry decision and Zenodo steps, apart from the CLI in
// scripts/zenodo-mint.ts (which runs on import), so tests can drive them with
// a fake client.
import type { Deposition, ZenodoClient } from "./zenodo-client.ts";
import { pruneDraftFiles } from "./zenodo-files.ts";
import { computeStateHash } from "./zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./zenodo-metadata.ts";
import type { DoiRecord } from "./zenodo-state.ts";

export type Action = "create" | "newversion" | "skip";

export type MintClient = Pick<
  ZenodoClient,
  | "createDeposition"
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

export function decide(
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

export interface Deposit {
  filename: string;
  bytes: Buffer;
  metadata: Record<string, any>;
}

/** A new record: a draft reserving the DOI, the file, the metadata, publish. */
export async function createRecord(
  zen: MintClient,
  { filename, bytes, metadata }: Deposit,
): Promise<{ published: Deposition; conceptDoi: string }> {
  // Create a draft reserving the DOI; metadata is set authoritatively by
  // the updateMetadata call below (not duplicated in the create body).
  const draft = await zen.createDeposition({ prereserve_doi: true });
  const bucket = draft.links.bucket;
  if (!bucket) throw new Error("no bucket link on draft");
  await zen.uploadFile(bucket, filename, bytes);
  await zen.updateMetadata(draft.id, metadata);
  const published = await zen.publish(draft.id);
  return {
    published,
    conceptDoi: published.conceptdoi ?? draft.conceptdoi ?? "",
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
