import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DoiMap,
  type DoiRecord,
  mergeDoiMaps,
  readDoiMap,
  writeDoiMap,
} from "./zenodo-state";

const rec = (conceptDoi: string, version = "1"): DoiRecord => ({
  recordId: 1,
  conceptDoi,
  versionDoi: `${conceptDoi}.v${version}`,
  contentHash: "h",
  status: "published",
  version,
  mintedAt: "2026-10-08T00:00:00.000Z",
  env: "production",
});

describe("readDoiMap", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "iobio-state-"));
    file = path.join(dir, "zenodo-dois.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns {} when nothing has been minted yet (no file)", () => {
    expect(readDoiMap(file)).toEqual({});
  });

  it("returns the map as written (round trip, slug-sorted)", () => {
    const map = { "b-b-2020": rec("10.5281/zenodo.2"), "a-a-2020": rec("10.5281/zenodo.1") };
    writeDoiMap(file, map);
    expect(readDoiMap(file)).toEqual(map);
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")))).toEqual([
      "a-a-2020",
      "b-b-2020",
    ]);
  });

  it("fails loudly on malformed JSON instead of re-minting everything", () => {
    writeFileSync(file, '{ "annan-ka-2019": ');
    expect(() => readDoiMap(file)).toThrow(/not valid JSON/);
  });

  it("fails loudly on an empty file", () => {
    writeFileSync(file, "");
    expect(() => readDoiMap(file)).toThrow(/not valid JSON/);
  });

  it.each(["null", "[]", '"text"'])("fails loudly when the JSON is %s", (body) => {
    writeFileSync(file, body);
    expect(() => readDoiMap(file)).toThrow(/must be a JSON object/);
  });

  it.each([
    ["null", null],
    ["no recordId", { conceptDoi: "10.5281/zenodo.1" }],
    ["no conceptDoi", { recordId: 1 }],
  ])("fails loudly on a broken record (%s)", (_label, bad) => {
    writeFileSync(file, JSON.stringify({ "a-a-2020": rec("10.5281/zenodo.1"), "x-x-2020": bad }));
    expect(() => readDoiMap(file)).toThrow(/"x-x-2020" is not a DOI record/);
  });

  it("accepts an empty conceptDoi (the mint writes one when Zenodo omits it)", () => {
    const map = { "a-a-2020": rec("") };
    writeDoiMap(file, map);
    expect(readDoiMap(file)).toEqual(map);
  });
});

describe("mergeDoiMaps (commit a run's map onto a main that moved)", () => {
  const a = rec("10.5281/zenodo.1");
  const b = rec("10.5281/zenodo.2");
  const c = rec("10.5281/zenodo.3");

  it("keeps records another run committed while this one was queued", () => {
    // P1 pushed {a, b}; P2 started from {} and minted c.
    const merged: DoiMap = mergeDoiMaps({}, { c }, { a, b });
    expect(merged).toEqual({ a, b, c });
  });

  it("applies this run's new version of an existing entry", () => {
    const a2 = rec("10.5281/zenodo.1", "2");
    expect(mergeDoiMaps({ a, b }, { a: a2, b }, { a, b })).toEqual({ a: a2, b });
  });

  it("does not revert a record that only main changed", () => {
    const b2 = rec("10.5281/zenodo.2", "2");
    expect(mergeDoiMaps({ a, b }, { a, b }, { a, b: b2 })).toEqual({ a, b: b2 });
  });

  it("never drops a record", () => {
    expect(mergeDoiMaps({ a, b }, { a }, { a, b })).toEqual({ a, b });
  });
});
