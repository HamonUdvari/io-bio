import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentEntrySlugs,
  makeRetiredEntryMatcher,
  readProductionDoiMap,
  retiredEntries,
} from "./retiredEntries";

const map = {
  "annan-ka-2019": {
    conceptDoi: "10.5281/zenodo.1",
    title: "ANNAN, Kofi Atta",
    authors: "Chloé Maurel",
  },
  "holtrop-mw-2021": {
    conceptDoi: "10.5281/zenodo.2",
    title: "HOLTROP, Marius Wilhelm",
    authors: "Bob Reinalda",
  },
  "broken-x-2020": {}, // malformed record: no DOI
};

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "iobio-retired-"));

describe("retiredEntries", () => {
  it("returns entries that have a DOI but no current Word file", () => {
    expect(retiredEntries(map, new Set(["annan-ka-2019"]))).toEqual([
      {
        slug: "holtrop-mw-2021",
        conceptDoi: "10.5281/zenodo.2",
        title: "HOLTROP, Marius Wilhelm",
        authors: "Bob Reinalda",
      },
    ]);
  });

  it("never retires an entry that exists again (restored = normal page)", () => {
    expect(
      retiredEntries(map, new Set(["annan-ka-2019", "holtrop-mw-2021"])),
    ).toEqual([]);
  });

  it("skips records without a concept DOI", () => {
    expect(retiredEntries(map, new Set()).map((r) => r.slug)).toEqual([
      "annan-ka-2019",
      "holtrop-mw-2021",
    ]);
  });

  it("ignores sandbox records copied into the production map", () => {
    const mixed = {
      "a-a-2020": { conceptDoi: "10.5072/zenodo.9" }, // sandbox concept DOI
      "b-b-2020": { conceptDoi: "10.5281/zenodo.8", env: "sandbox" },
      "c-c-2020": { conceptDoi: "10.5281/zenodo.7", env: "production" },
      "d-d-2020": { conceptDoi: "10.5281/zenodo.6", versionDoi: "10.5072/zenodo.5" },
    };
    expect(retiredEntries(mixed, new Set()).map((r) => r.slug)).toEqual([
      "c-c-2020",
    ]);
  });

  it("skips (does not crash on) a non-string concept DOI", () => {
    expect(
      retiredEntries({ "x-x-2020": { conceptDoi: 123 } }, new Set()),
    ).toEqual([]);
  });

  it("returns nothing for an empty map (no production DOIs yet)", () => {
    expect(retiredEntries({}, new Set())).toEqual([]);
  });

  it("omits title/authors when the record predates them", () => {
    expect(
      retiredEntries({ "x-y-2020": { conceptDoi: "10.5281/zenodo.3" } }, new Set()),
    ).toEqual([{ slug: "x-y-2020", conceptDoi: "10.5281/zenodo.3" }]);
  });
});

describe("readProductionDoiMap", () => {
  it("returns {} when the file does not exist", () => {
    expect(readProductionDoiMap("/nonexistent/zenodo-dois.json")).toEqual({});
  });

  it("fails loudly on malformed JSON (it holds permanent DOIs)", () => {
    const dir = tmp();
    try {
      const f = path.join(dir, "zenodo-dois.json");
      writeFileSync(f, "{ not json");
      expect(() => readProductionDoiMap(f)).toThrow(/not valid JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly when the JSON is not an object", () => {
    const dir = tmp();
    try {
      const f = path.join(dir, "zenodo-dois.json");
      writeFileSync(f, "[]");
      expect(() => readProductionDoiMap(f)).toThrow(/must be a JSON object/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("currentEntrySlugs (same rule as the docx loader)", () => {
  it("slugs .docx file names and ignores other files", () => {
    const dir = tmp();
    try {
      for (const f of ["Annan-KA 2019.docx", "M'Bow-AM 2018.docx", "notes.txt"])
        writeFileSync(path.join(dir, f), "");
      expect(currentEntrySlugs(dir)).toEqual(
        new Set(["annan-ka-2019", "mbow-am-2018"]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("matches the extension case-sensitively, skips dotfiles, and recurses", () => {
    const dir = tmp();
    try {
      mkdirSync(path.join(dir, "Sub Folder"));
      for (const f of [
        "Bogsch-A 2026.DOCX", // not loaded by the loader either
        ".hidden-X 2020.docx",
        "Sub Folder/Annan-KA 2019.docx",
      ])
        writeFileSync(path.join(dir, f), "");
      expect(currentEntrySlugs(dir)).toEqual(
        new Set(["sub-folder/annan-ka-2019"]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty set for a missing folder", () => {
    expect(currentEntrySlugs("/nonexistent/iobio-bios")).toEqual(new Set());
  });
});

describe("makeRetiredEntryMatcher (sitemap filter)", () => {
  const isRetired = makeRetiredEntryMatcher([
    { slug: "hammarskjöld-d-2025", conceptDoi: "10.5281/zenodo.5" },
    { slug: "holtrop-mw-2021", conceptDoi: "10.5281/zenodo.2" },
  ]);

  it("matches the percent-encoded path the sitemap integration passes", () => {
    expect(isRetired("/entries/hammarskj%C3%B6ld-d-2025/")).toBe(true);
  });

  it("matches with or without the trailing slash", () => {
    expect(isRetired("/entries/holtrop-mw-2021")).toBe(true);
    expect(isRetired("/entries/holtrop-mw-2021/")).toBe(true);
  });

  it("does not match a live entry or a malformed escape", () => {
    expect(isRetired("/entries/annan-ka-2019/")).toBe(false);
    expect(isRetired("/entries/%E0%A4%A/")).toBe(false);
  });
});
