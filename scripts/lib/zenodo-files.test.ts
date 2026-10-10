import { afterEach, describe, expect, it, vi } from "vitest";
import { createZenodoClient, type DepositionFile } from "./zenodo-client";
import { pruneDraftFiles } from "./zenodo-files";

const file = (filename: string): DepositionFile => ({
  id: `id-${filename}`,
  filename,
});

/** A fake client: records calls; `failDelete` / `listError` make those calls throw. */
function fake(
  files: DepositionFile[],
  o: { listError?: string; failDelete?: Record<string, string> } = {},
) {
  const deleted: string[] = [];
  const log: string[] = [];
  const zen = {
    listFiles: async () => {
      if (o.listError) throw new Error(o.listError);
      return files;
    },
    deleteFile: async (_id: number, f: DepositionFile) => {
      const msg = o.failDelete?.[f.filename];
      if (msg)
        throw Object.assign(new Error(msg), {
          status: Number(msg.match(/→ (\d{3})/)?.[1]),
        });
      deleted.push(f.filename);
    },
  };
  const run = () =>
    pruneDraftFiles(
      zen,
      7,
      "a-iobio.pdf",
      (m) => log.push(`warn: ${m}`),
      (m) => log.push(`info: ${m}`),
    );
  return { run, deleted, log };
}

describe("pruneDraftFiles", () => {
  it("deletes every file except the entry PDF", async () => {
    const f = fake([file("a.pdf"), file("a-iobio.pdf"), file("old.txt")]);
    await f.run();
    expect(f.deleted).toEqual(["a.pdf", "old.txt"]);
    expect(f.log).toEqual([
      "info: removed legacy file a.pdf",
      "info: removed legacy file old.txt",
    ]);
  });

  it("deletes nothing when the entry PDF is missing", async () => {
    const f = fake([file("a.pdf")]);
    await f.run();
    expect(f.deleted).toEqual([]);
    expect(f.log).toEqual(["warn: draft 7 has no a-iobio.pdf; kept all files"]);
  });

  it("only warns when the listing fails", async () => {
    const f = fake([], { listError: "GET … → 500" });
    await expect(f.run()).resolves.toBeUndefined();
    expect(f.log).toEqual([
      "warn: could not list the files of draft 7: GET … → 500",
    ]);
  });

  it("goes on after a failed delete, and treats a 404 as already removed", async () => {
    const f = fake(
      [file("a.pdf"), file("b.pdf"), file("c.pdf"), file("a-iobio.pdf")],
      {
        failDelete: {
          "a.pdf": "DELETE … → 403 Forbidden",
          "b.pdf": "DELETE … → 404 Not Found",
        },
      },
    );
    await expect(f.run()).resolves.toBeUndefined();
    expect(f.deleted).toEqual(["c.pdf"]);
    expect(f.log).toEqual([
      "warn: could not remove a.pdf from draft 7: DELETE … → 403 Forbidden",
      "info: legacy file b.pdf already gone",
      "info: removed legacy file c.pdf",
    ]);
  });

  it("only warns when the listing isn't a list", async () => {
    const f = fake(null as unknown as DepositionFile[]);
    await expect(f.run()).resolves.toBeUndefined();
    expect(f.log).toEqual([
      "warn: unexpected file listing for draft 7; kept all files",
    ]);
  });

  it("makes no delete call when only the entry PDF is there", async () => {
    const f = fake([file("a-iobio.pdf")]);
    await f.run();
    expect(f.deleted).toEqual([]);
    expect(f.log).toEqual([]);
  });
});

describe("deleteFile", () => {
  afterEach(() => vi.unstubAllGlobals());
  const BASE = "https://sandbox.zenodo.org/api";
  /** Records the URL of each request; answers with `status`. */
  function capture(status: number) {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(null, { status });
    });
    return urls;
  }
  const zen = () =>
    createZenodoClient({ baseUrl: BASE, token: "t", minIntervalMs: 0 });

  it("deletes by file id on this API, whatever the listing's links say", async () => {
    const urls = capture(204);
    await zen().deleteFile(7, {
      id: "a b",
      filename: "a.pdf",
      links: { self: "https://example.org/deposit/depositions/9/files/other" },
    });
    expect(urls).toEqual([`${BASE}/deposit/depositions/7/files/a%20b`]);
  });

  it("puts the HTTP status on the error", async () => {
    capture(404);
    await expect(
      zen().deleteFile(7, { id: "x", filename: "a.pdf" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
