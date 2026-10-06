import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentEntrySlugs, retiredEntries } from "./retiredEntries";

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

  it("returns nothing for an empty map (no production DOIs yet)", () => {
    expect(retiredEntries({}, new Set())).toEqual([]);
  });

  it("omits title/authors when the record predates them", () => {
    expect(
      retiredEntries({ "x-y-2020": { conceptDoi: "10.5281/zenodo.3" } }, new Set()),
    ).toEqual([{ slug: "x-y-2020", conceptDoi: "10.5281/zenodo.3" }]);
  });
});

describe("currentEntrySlugs", () => {
  it("slugs .docx file names like the loader and ignores other files", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iobio-bios-"));
    try {
      for (const f of ["Annan-KA 2019.docx", "Bogsch-A 2026.DOCX", "notes.txt"])
        writeFileSync(path.join(dir, f), "");
      expect(currentEntrySlugs(dir)).toEqual(
        new Set(["annan-ka-2019", "bogsch-a-2026"]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty set for a missing folder", () => {
    expect(currentEntrySlugs("/nonexistent/iobio-bios")).toEqual(new Set());
  });
});
