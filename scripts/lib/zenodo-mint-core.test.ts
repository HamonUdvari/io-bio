import { describe, expect, it } from "vitest";
import {
  citesRecord,
  decide,
  draftRecord,
  draftState,
  idFromUrl,
  newVersionOf,
  publishDraft,
  publishedDoiProblem,
  publishedRecord,
  recordAfterPublish,
  reserveDraft,
} from "./zenodo-mint-core.ts";
import type { MintClient } from "./zenodo-mint-core.ts";
import { computeStateHash } from "./zenodo-metadata.ts";
import type { MetaEntry, MetadataConfig } from "./zenodo-metadata.ts";
import type { DoiRecord } from "./zenodo-state.ts";

const cfg = { license: "cc-by-nc-nd-4.0" } as MetadataConfig;
const entry = {
  slug: "x-2020",
  contentHash: "sha256:abc",
  version: "Version 1 January 2020",
  authors: "Ann Author",
} as MetaEntry;
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
      return {
        id: 11,
        conceptrecid: "10",
        links: { bucket: "bucket/11" },
        metadata: {},
      };
    },
    reserveDoi: async (id) => {
      calls.push(`reserve ${id}`);
    },
    deleteDeposition: async (id) => {
      calls.push(`delete draft ${id}`);
    },
    getDeposition: async (id) => {
      calls.push(`get ${id}`);
      return {
        id,
        doi: `10.5072/zenodo.${id}`,
        links: { bucket: `bucket/${id}` },
        metadata: {},
      };
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
    ["no record", undefined, false, "reserve"],
    ["a draft", record({ status: "draft", contentHash: "" }), false, "publish"],
    ["a draft, --force", record({ status: "draft" }), true, "publish"],
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

describe("reserveDraft", () => {
  it("creates a draft, reserves its DOI, and reads the DOI back", async () => {
    const { zen, calls } = fakeZen();
    expect(await reserveDraft(zen, "sandbox", silent)).toEqual({
      recordId: 11,
      conceptRecId: 10,
      versionDoi: "10.5072/zenodo.11",
    });
    expect(calls).toEqual(["create {}", "reserve 11", "get 11"]);
  });

  const withDoi = (doi?: string) =>
    fakeZen({
      getDeposition: async (id) => ({ id, doi, links: {}, metadata: {} }),
    });

  it.each([
    [
      "no DOI after the reservation",
      withDoi(undefined),
      "has no DOI after the reservation",
    ],
    // The legacy API's computed DOI has the production prefix on the sandbox.
    [
      "a production DOI in the sandbox",
      withDoi("10.5281/zenodo.11"),
      "is not a sandbox DOI",
    ],
    [
      "a failed reservation",
      fakeZen({
        reserveDoi: async () => {
          throw Object.assign(new Error("server"), { status: 500 });
        },
      }),
      "the DOI reservation failed: server",
    ],
  ])(
    "deletes the draft and throws on %s",
    async (_, { zen, calls }, message) => {
      await expect(reserveDraft(zen, "sandbox", silent)).rejects.toThrow(
        message,
      );
      expect(calls).toContain("delete draft 11");
    },
  );

  it("deletes the draft when the reserved DOI cannot be read back", async () => {
    const { zen, calls } = fakeZen({
      getDeposition: async () => {
        throw Object.assign(new Error("server"), { status: 500 });
      },
    });
    await expect(reserveDraft(zen, "sandbox", silent)).rejects.toThrow(
      "the reserved DOI could not be read back: server; deleted draft 11",
    );
    expect(calls).toContain("delete draft 11");
  });

  it("still throws the real problem when the delete finds no draft (404)", async () => {
    const warnings: string[] = [];
    const { zen } = fakeZen({
      getDeposition: async (id) => ({ id, links: {}, metadata: {} }),
      deleteDeposition: async () => {
        throw Object.assign(new Error("not found"), { status: 404 });
      },
    });
    await expect(
      reserveDraft(zen, "sandbox", {
        info: () => {},
        warn: (m) => warnings.push(m),
      }),
    ).rejects.toThrow("no DOI after the reservation");
    expect(warnings).toEqual([]);
  });

  it("warns, and still throws the real problem, when the delete fails", async () => {
    const warnings: string[] = [];
    const { zen } = fakeZen({
      getDeposition: async (id) => ({ id, links: {}, metadata: {} }),
      deleteDeposition: async () => {
        throw Object.assign(new Error("server"), { status: 500 });
      },
    });
    await expect(
      reserveDraft(zen, "sandbox", {
        info: () => {},
        warn: (m) => warnings.push(m),
      }),
    ).rejects.toThrow(
      "no DOI after the reservation; could not delete draft 11",
    );
    expect(warnings.join()).toContain("could not delete draft 11");
  });

  it("checks the production prefix in production", async () => {
    const { zen } = fakeZen();
    await expect(reserveDraft(zen, "production", silent)).rejects.toThrow(
      "is not a production DOI",
    );
  });

  it("warns when the draft has no concept record id", async () => {
    const warnings: string[] = [];
    const { zen } = fakeZen({
      createDeposition: async () => ({ id: 11, links: {}, metadata: {} }),
    });
    const r = await reserveDraft(zen, "sandbox", {
      info: () => {},
      warn: (m) => warnings.push(m),
    });
    expect(r.conceptRecId).toBeUndefined();
    expect(warnings.join()).toContain("no concept record id");
  });
});

describe("publishDraft", () => {
  const draft = record({
    recordId: 11,
    conceptRecId: 10,
    conceptDoi: "",
    versionDoi: "10.5072/zenodo.11",
    contentHash: "",
    status: "draft",
  });

  it("uploads to the reserved draft, keeps only the entry PDF, and publishes it", async () => {
    const { zen, calls } = fakeZen();
    const outcome = await publishDraft(zen, draft, "x-2020", deposit, silent);
    expect(outcome.kind === "published" && outcome.published.doi).toBe(
      "10.5072/zenodo.11",
    );
    expect(calls).toEqual([
      "get 11",
      "upload bucket/11 x-2020-iobio.pdf",
      "list 11",
      "delete 11 x-2020.pdf",
      "metadata 11",
      "publish 11",
    ]);
    expect(outcome.kind).toBe("published");
  });

  it("throws when the draft has no bucket link", async () => {
    const { zen } = fakeZen({
      getDeposition: async (id) => ({ id, links: {}, metadata: {} }),
    });
    await expect(
      publishDraft(zen, draft, "x-2020", deposit, silent),
    ).rejects.toThrow("no bucket link");
  });

  it.each([404, 410])("reports a draft that is gone (%i)", async (status) => {
    const { zen } = fakeZen({
      getDeposition: async () => {
        throw Object.assign(new Error("gone"), { status });
      },
    });
    expect(await publishDraft(zen, draft, "x-2020", deposit, silent)).toEqual({
      kind: "gone",
    });
  });

  it("fails on another error (403)", async () => {
    const { zen } = fakeZen({
      getDeposition: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
    });
    await expect(
      publishDraft(zen, draft, "x-2020", deposit, silent),
    ).rejects.toThrow("forbidden");
  });

  it("uploads nothing when the draft was already published", async () => {
    const { zen, calls } = fakeZen({
      getDeposition: async (id) => ({
        id,
        submitted: true,
        doi: "10.5072/zenodo.11",
        links: {},
        metadata: {},
      }),
    });
    const outcome = await publishDraft(zen, draft, "x-2020", deposit, silent);
    expect(outcome.kind).toBe("submitted");
    expect(calls).toEqual([]);
  });
});

describe("draftState", () => {
  const draft = record({ recordId: 11, status: "draft" });
  it("finds a draft that is still a draft", async () => {
    expect(await draftState(fakeZen().zen, draft)).toEqual({ kind: "draft" });
  });
  it("finds a draft that an earlier run published", async () => {
    const { zen } = fakeZen({
      getDeposition: async (id) => ({
        id,
        submitted: true,
        doi: "10.5072/zenodo.11",
        links: {},
        metadata: {},
      }),
    });
    const now = await draftState(zen, draft);
    expect(now.kind).toBe("submitted");
  });
  it.each([404, 410])("reports a gone draft (%i)", async (status) => {
    const { zen } = fakeZen({
      getDeposition: async () => {
        throw Object.assign(new Error("gone"), { status });
      },
    });
    expect(await draftState(zen, draft)).toEqual({ kind: "gone" });
  });
  it("throws on another error", async () => {
    const { zen } = fakeZen({
      getDeposition: async () => {
        throw Object.assign(new Error("server"), { status: 500 });
      },
    });
    await expect(draftState(zen, draft)).rejects.toThrow("server");
  });
});

describe("recordAfterPublish", () => {
  const draft = record({
    recordId: 11,
    conceptRecId: 10,
    conceptDoi: "",
    versionDoi: "10.5072/zenodo.11",
    contentHash: "",
    status: "draft",
  });
  const dep = (doi: string) => ({
    id: 11,
    doi,
    conceptdoi: "10.5072/zenodo.10",
    conceptrecid: "10",
    links: {},
    metadata: {},
  });

  it("records the published DOIs and the content hash", () => {
    const { record: r, problem } = recordAfterPublish(
      draft,
      { kind: "published", published: dep("10.5072/zenodo.11") },
      entry,
      cfg,
      "sandbox",
      "X, Y",
    );
    expect(problem).toBeNull();
    expect(r).toMatchObject({
      recordId: 11,
      conceptRecId: 10,
      conceptDoi: "10.5072/zenodo.10",
      versionDoi: "10.5072/zenodo.11",
      contentHash: computeStateHash(entry, cfg),
      status: "published",
    });
  });

  it("keeps the hash empty for a draft an earlier run published", () => {
    const { record: r, problem } = recordAfterPublish(
      draft,
      { kind: "submitted", published: dep("10.5072/zenodo.11") },
      entry,
      cfg,
      "sandbox",
      "X, Y",
    );
    expect(problem).toBeNull();
    expect(r.contentHash).toBe("");
    expect(r.status).toBe("published");
  });

  it("records the REAL DOI with an empty hash when it is not the reserved one", () => {
    const { record: r, problem } = recordAfterPublish(
      draft,
      { kind: "published", published: dep("10.5072/zenodo.99") },
      entry,
      cfg,
      "sandbox",
      "X, Y",
    );
    expect(problem).toContain("is not the reserved");
    expect(r.versionDoi).toBe("10.5072/zenodo.99");
    expect(r.contentHash).toBe("");
  });
});

describe("publishedDoiProblem", () => {
  const draft = record({
    recordId: 11,
    conceptRecId: 10,
    versionDoi: "10.5072/zenodo.11",
    status: "draft",
  });
  const published = (doi: string, conceptrecid: number) => ({
    id: 11,
    doi,
    conceptrecid,
    links: {},
    metadata: {},
  });

  it("accepts the reserved DOI and concept record", () => {
    expect(
      publishedDoiProblem(draft, published("10.5072/zenodo.11", 10), "sandbox"),
    ).toBeNull();
  });
  it("reports another DOI", () => {
    expect(
      publishedDoiProblem(draft, published("10.5072/zenodo.12", 10), "sandbox"),
    ).toContain("is not the reserved");
  });
  it("reports another concept record in the sandbox only", () => {
    expect(
      publishedDoiProblem(draft, published("10.5072/zenodo.11", 9), "sandbox"),
    ).toContain("which the PDF cites");
    expect(
      publishedDoiProblem(
        draft,
        published("10.5072/zenodo.11", 9),
        "production",
      ),
    ).toBeNull();
  });
});

describe("citesRecord", () => {
  const html = '<a href="https://sandbox.zenodo.org/records/506411">x</a>';
  it("matches the exact link", () => {
    expect(citesRecord(html, "https://sandbox.zenodo.org/records/506411")).toBe(
      true,
    );
  });
  it("does not match a prefix of another record", () => {
    expect(citesRecord(html, "https://sandbox.zenodo.org/records/50641")).toBe(
      false,
    );
  });
});

describe("map records", () => {
  it("builds a draft record with no concept DOI and no hash", () => {
    expect(
      draftRecord(entry, "X, Y", "production", {
        recordId: 40,
        versionDoi: "10.5281/zenodo.40",
      }),
    ).toMatchObject({
      recordId: 40,
      conceptDoi: "",
      versionDoi: "10.5281/zenodo.40",
      contentHash: "",
      status: "draft",
      version: "1 January 2020",
      env: "production",
      title: "X, Y",
      authors: "Ann Author",
    });
  });

  it("builds a published record from Zenodo's response", () => {
    expect(
      publishedRecord(
        entry,
        "X, Y",
        "sandbox",
        {
          id: 12,
          doi: "10.5072/zenodo.12",
          conceptrecid: "10",
          links: {},
          metadata: {},
        },
        "10.5072/zenodo.10",
        "sha256:h",
      ),
    ).toMatchObject({
      recordId: 12,
      conceptRecId: 10,
      conceptDoi: "10.5072/zenodo.10",
      versionDoi: "10.5072/zenodo.12",
      contentHash: "sha256:h",
      status: "published",
    });
  });
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
