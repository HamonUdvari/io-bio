// Keeps a new-version draft's files to exactly the entry PDF. A new version
// starts with a copy of the previous version's files, so the legacy
// "<slug>.pdf" (from before the "-iobio" file name) would otherwise ride along
// on every version next to the current "<slug>-iobio.pdf".
import type { ZenodoClient } from "./zenodo-client.ts";

type FilesClient = Pick<ZenodoClient, "listFiles" | "deleteFile">;

/**
 * Deletes every file of the draft except `keep`. Never throws: a failure only
 * warns, and the publish then simply carries the extra file, as before. Deletes
 * nothing when `keep` is not in the listing (a failed upload must not leave the
 * draft empty).
 */
export async function pruneDraftFiles(
  zen: FilesClient,
  draftId: number,
  keep: string,
  warn: (msg: string) => void,
  info: (msg: string) => void,
): Promise<void> {
  let files;
  try {
    files = await zen.listFiles(draftId);
  } catch (err) {
    warn(
      `could not list the files of draft ${draftId}: ${(err as Error).message}`,
    );
    return;
  }
  if (!files.some((f) => f.filename === keep)) {
    warn(`draft ${draftId} has no ${keep}; kept all files`);
    return;
  }
  for (const f of files) {
    if (f.filename === keep) continue;
    try {
      await zen.deleteFile(draftId, f);
      info(`removed legacy file ${f.filename}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (/\b404\b/.test(msg)) info(`legacy file ${f.filename} already gone`);
      else warn(`could not remove ${f.filename} from draft ${draftId}: ${msg}`);
    }
  }
}
