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
      const err = o.failDelete?.[f.filename];
      if (err) throw new Error(err);
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
  /** Records the URL of each request; answers 204. */
  function capture() {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(null, { status: 204 });
    });
    return urls;
  }
  const zen = () =>
    createZenodoClient({ baseUrl: BASE, token: "t", minIntervalMs: 0 });

  it("uses the listing's self link when it points to this API", async () => {
    const urls = capture();
    const self = `${BASE}/deposit/depositions/7/files/abc`;
    await zen().deleteFile(7, {
      id: "abc",
      filename: "a.pdf",
      links: { self },
    });
    expect(urls).toEqual([self]);
  });

  it("never sends the token to another host", async () => {
    const urls = capture();
    await zen().deleteFile(7, {
      id: "a b",
      filename: "a.pdf",
      links: { self: "https://example.org/deposit/depositions/7/files/abc" },
    });
    expect(urls).toEqual([`${BASE}/deposit/depositions/7/files/a%20b`]);
  });
});
