import { describe, expect, it } from "vitest";
import {
  createRecord,
  decide,
  idFromUrl,
  newVersionOf,
} from "./zenodo-mint-core.ts";
import type { MintClient } from "./zenodo-mint-core.ts";
import { computeStateHash } from "./zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./zenodo-metadata.ts";
import type { DoiRecord } from "./zenodo-state.ts";

const cfg = { license: "cc-by-nc-nd-4.0" } as MetadataConfig;
const entry = { slug: "x-2020", contentHash: "sha256:abc" } as MetaEntry;
const record = (over: Partial<DoiRecord> = {}): DoiRecord => ({
  recordId: 5,
  conceptRecId: 1,
  conceptDoi: "10.5072/zenodo.1",
  versionDoi: "10.5072/zenodo.5",
  contentHash: computeStateHash(entry, cfg),
  status: "published",
  version: "1 January 2020",
  mintedAt: "2026-01-01T00:00:00.000Z",
  env: "sandbox",
  ...over,
});
const deposit = {
  filename: "x-2020-iobio.pdf",
  bytes: Buffer.from("%PDF"),
  metadata: { title: "X, Y" },
};
const DRAFT_URL = (id: number) =>
  `https://sandbox.zenodo.org/api/deposit/depositions/${id}`;

/** A fake client that logs each call; `over` replaces single methods. */
function fakeZen(over: Partial<MintClient> = {}) {
  const calls: string[] = [];
  const zen: MintClient = {
    createDeposition: async (m) => {
      calls.push(`create ${JSON.stringify(m)}`);
      return { id: 11, links: { bucket: "bucket/11" }, metadata: {} };
    },
    getDeposition: async (id) => {
      calls.push(`get ${id}`);
      return { id, links: { bucket: `bucket/${id}` }, metadata: {} };
    },
    uploadFile: async (bucket, filename) => {
      calls.push(`upload ${bucket} ${filename}`);
    },
    updateMetadata: async (id) => {
      calls.push(`metadata ${id}`);
      return { id, links: {}, metadata: {} };
    },
    publish: async (id) => {
      calls.push(`publish ${id}`);
      return {
        id,
        links: {},
        metadata: {},
        doi: `10.5072/zenodo.${id}`,
        conceptdoi: "10.5072/zenodo.1",
        conceptrecid: 1,
      };
    },
    newVersion: async (id) => {
      calls.push(`newversion ${id}`);
      return { id, links: { latest_draft: DRAFT_URL(12) }, metadata: {} };
    },
    listFiles: async (id) => {
      calls.push(`list ${id}`);
      return [
        { id: "f1", filename: "x-2020-iobio.pdf" },
        { id: "f2", filename: "x-2020.pdf" },
      ];
    },
    deleteFile: async (id, f) => {
      calls.push(`delete ${id} ${f.filename}`);
    },
    ...over,
  };
  return { zen, calls };
}
const silent = { info: () => {}, warn: () => {} };

describe("idFromUrl", () => {
  it("reads the deposition id", () => {
    expect(idFromUrl(DRAFT_URL(12))).toBe(12);
  });
  it("throws on another URL", () => {
    expect(() => idFromUrl("https://zenodo.org/records/12")).toThrow();
  });
});

describe("decide", () => {
  it.each([
    ["no record", undefined, false, "create"],
    ["the same hash", record(), false, "skip"],
    [
      "another hash",
      record({ contentHash: "sha256:old" }),
      false,
      "newversion",
    ],
    ["--force", record(), true, "newversion"],
  ] as const)("%s → %s", (_, state, force, action) => {
    expect(decide(entry, cfg, state, force)).toBe(action);
  });
});

describe("createRecord", () => {
  it("reserves the DOI, uploads, sets the metadata, then publishes", async () => {
    const { zen, calls } = fakeZen();
    const { published, conceptDoi } = await createRecord(zen, deposit);
    expect(calls).toEqual([
      'create {"prereserve_doi":true}',
      "upload bucket/11 x-2020-iobio.pdf",
      "metadata 11",
      "publish 11",
    ]);
    expect(published.doi).toBe("10.5072/zenodo.11");
    expect(conceptDoi).toBe("10.5072/zenodo.1");
  });

  it("falls back to the draft's concept DOI, then to empty", async () => {
    const noConcept = async (id: number) => ({ id, links: {}, metadata: {} });
    const withDraftConcept = fakeZen({
      publish: noConcept,
      createDeposition: async () => ({
        id: 11,
        links: { bucket: "bucket/11" },
        metadata: {},
        conceptdoi: "10.5072/zenodo.9",
      }),
    });
    expect((await createRecord(withDraftConcept.zen, deposit)).conceptDoi).toBe(
      "10.5072/zenodo.9",
    );
    const neither = fakeZen({ publish: noConcept });
    expect((await createRecord(neither.zen, deposit)).conceptDoi).toBe("");
  });

  it.each(["uploadFile", "publish"] as const)(
    "rejects when %s fails",
    async (step) => {
      const { zen } = fakeZen({
        [step]: async () => {
          throw new Error(`${step} failed`);
        },
      });
      await expect(createRecord(zen, deposit)).rejects.toThrow(
        `${step} failed`,
      );
    },
  );
});

describe("newVersionOf", () => {
  it("opens a new version, keeps only the entry PDF, then publishes", async () => {
    const { zen, calls } = fakeZen();
    const { published } = await newVersionOf(
      zen,
      record(),
      "x-2020",
      deposit,
      silent,
    );
    expect(calls).toEqual([
      "newversion 5",
      "get 12",
      "upload bucket/12 x-2020-iobio.pdf",
      "list 12",
      "delete 12 x-2020.pdf",
      "metadata 12",
      "publish 12",
    ]);
    expect(published.doi).toBe("10.5072/zenodo.12");
  });

  it("logs the pruned file with the entry's slug", async () => {
    const info: string[] = [];
    const { zen } = fakeZen();
    await newVersionOf(zen, record(), "x-2020", deposit, {
      info: (m) => info.push(m),
      warn: () => {},
    });
    expect(info).toEqual(["  x-2020: removed legacy file x-2020.pdf"]);
  });

  it("keeps the previous concept DOI when publish returns none", async () => {
    const { zen } = fakeZen({
      publish: async (id) => ({ id, links: {}, metadata: {} }),
    });
    const { conceptDoi } = await newVersionOf(
      zen,
      record({ conceptDoi: "10.5072/zenodo.7" }),
      "x-2020",
      deposit,
      silent,
    );
    expect(conceptDoi).toBe("10.5072/zenodo.7");
  });

  it.each(["uploadFile", "publish"] as const)(
    "rejects when %s fails",
    async (step) => {
      const { zen } = fakeZen({
        [step]: async () => {
          throw new Error(`${step} failed`);
        },
      });
      await expect(
        newVersionOf(zen, record(), "x-2020", deposit, silent),
      ).rejects.toThrow(`${step} failed`);
    },
  );

  it("adopts a dangling draft when newversion is refused", async () => {
    const warnings: string[] = [];
    const { zen, calls } = fakeZen({
      newVersion: async () => {
        throw new Error("Please remove all files first");
      },
      getDeposition: async (id) => ({
        id,
        links:
          id === 5
            ? { latest_draft: DRAFT_URL(13) }
            : { bucket: `bucket/${id}` },
        metadata: {},
      }),
    });
    await newVersionOf(zen, record(), "x-2020", deposit, {
      info: () => {},
      warn: (m) => warnings.push(m),
    });
    expect(calls).toContain("publish 13");
    expect(warnings.join()).toContain("adopting existing draft 13");
  });

  it("adopts the draft when the newversion response has no draft link", async () => {
    const warnings: string[] = [];
    const { zen, calls } = fakeZen({
      newVersion: async (id) => ({ id, links: {}, metadata: {} }),
      getDeposition: async (id) => ({
        id,
        links:
          id === 5
            ? { latest_draft: DRAFT_URL(14) }
            : { bucket: `bucket/${id}` },
        metadata: {},
      }),
    });
    await newVersionOf(zen, record(), "x-2020", deposit, {
      info: () => {},
      warn: (m) => warnings.push(m),
    });
    expect(calls).toContain("publish 14");
    expect(warnings.join()).toContain(
      "no latest_draft link on newversion response",
    );
  });

  it("surfaces the error when there is no draft to adopt", async () => {
    const { zen } = fakeZen({
      newVersion: async () => {
        throw new Error("boom");
      },
      getDeposition: async (id) => ({ id, links: {}, metadata: {} }),
    });
    await expect(
      newVersionOf(zen, record(), "x-2020", deposit, silent),
    ).rejects.toThrow("boom");
  });
});
