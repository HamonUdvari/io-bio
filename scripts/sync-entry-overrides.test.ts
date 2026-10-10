// Archive / restore lifecycle of sync-entry-overrides.ts. Runs the real script
// in a temp folder with a hand-written dist/entry-data.json (no build needed).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./sync-entry-overrides.ts", import.meta.url));
const SLUG = "a-a-2020";
const CARD = `src/data/entry-overrides/${SLUG}.json`;
const ARCHIVED = `src/data/entry-overrides-archive/${SLUG}.json`;
const HISTORY = "src/data/entry-overrides-archive/history";

let dir: string;
const p = (rel: string) => path.join(dir, rel);
const read = (rel: string) => readFileSync(p(rel), "utf8");
const write = (rel: string, body: string) => {
  mkdirSync(path.dirname(p(rel)), { recursive: true });
  writeFileSync(p(rel), body);
};
/** A card as the script writes it. */
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const writeCard = (rel: string, card: unknown) => write(rel, json(card));

/** A dist/entry-data.json row. imageFn "" skips the portrait (sharp resize) step. */
const entry = (details: Record<string, string> = {}) => ({
  slug: SLUG,
  name: "Alpha Aleph",
  roles: [{ title: "Secretary-General", organisation: "Org" }],
  details: {
    imageSource: "Source: Archive",
    lastName: "Aleph",
    firstName: "Alpha",
    knownAs: "",
    nee: "",
    summary: "Secretary-General of Org",
    life: "1900-1990",
    nationality: "Dutch",
    version: "Version 1",
    authors: "Author One",
    editors: "Editor One",
    ...details,
  },
  imageFn: "",
});
const setEntries = (list: unknown[]) => write("dist/entry-data.json", JSON.stringify(list));

/** Runs the sync; returns its counts. */
function sync() {
  const out = execFileSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: "utf8",
    timeout: 10_000,
  });
  const m = out.match(
    /entry-overrides: (\d+) created, (\d+) updated, (\d+) restored, (\d+) archived, (\d+) total\./,
  );
  if (!m) throw new Error(`unexpected sync output:\n${out}`);
  const [created, updated, restored, archived, total] = m.slice(1).map(Number);
  return { created, updated, restored, archived, total };
}
const NONE = { created: 0, updated: 0, restored: 0, archived: 0 };

/** Every file under the temp folder except dist/, as path → content. */
function tree(sub = ""): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const f of readdirSync(p(rel), { withFileTypes: true })) {
      const r = path.join(rel, f.name);
      if (r === "dist") continue;
      if (f.isDirectory()) walk(r);
      else out[r] = read(r);
    }
  };
  if (existsSync(p(sub))) walk(sub);
  return out;
}
const history = () => (existsSync(p(HISTORY)) ? readdirSync(p(HISTORY)).sort() : []);
const historyName = (kind: string) =>
  new RegExp(`^${SLUG}\\.\\d{4}-\\d\\d-\\d\\dT[\\d-]+Z\\.${kind}\\.json$`);

/** The manual fields an editor sets in the CMS, on top of a synced card. */
function withManualFields(card: Record<string, any>) {
  return {
    ...card,
    rolesOverride: true,
    roles: [{ title: "Director-General", organisation: "Manual Org" }],
    portraitImage: "/src/content/bios-images/a.jpg",
    facePosition: 2,
    details: { ...card.details, summary: "Manual summary", summaryOverride: true },
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "iobio-sync-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("sync-entry-overrides lifecycle", () => {
  it("creates a card from Word, then a second run changes nothing", () => {
    setEntries([entry()]);
    expect(sync()).toMatchObject({ ...NONE, created: 1, total: 1 });
    const card = JSON.parse(read(CARD));
    expect(card).toMatchObject({
      slug: SLUG,
      name: "Alpha Aleph",
      rolesOverride: false,
      roles: [{ title: "Secretary-General", organisation: "Org" }],
      portraitImage: "",
      facePosition: null,
    });
    expect(card.details).toMatchObject({ summary: "Secretary-General of Org", summaryOverride: false });
    const before = tree();
    expect(sync()).toMatchObject(NONE);
    expect(tree()).toEqual(before);
  });

  it("keeps the manual fields and mirrors only the Word fields that are not overridden", () => {
    setEntries([entry()]);
    sync();
    const manual = withManualFields(JSON.parse(read(CARD)));
    writeCard(CARD, manual);
    expect(sync()).toMatchObject(NONE);
    expect(read(CARD)).toBe(json(manual));

    // A Word change reaches only the fields without an override.
    setEntries([entry({ summary: "Word summary v2", life: "1900-1991" })]);
    expect(sync()).toMatchObject({ ...NONE, updated: 1 });
    const card = JSON.parse(read(CARD));
    expect(card.roles).toEqual(manual.roles);
    expect(card.portraitImage).toBe(manual.portraitImage);
    expect(card.facePosition).toBe(2);
    expect(card.details.summary).toBe("Manual summary");
    expect(card.details.life).toBe("1900-1991");
  });

  it("archives the card of a removed entry and restores it, byte for byte, on re-add", () => {
    write("src/content/bios-images/a.jpg", "jpeg bytes");
    write("src/content/bios-images/README.md", "uploads");
    const uploads = tree("src/content/bios-images");

    setEntries([entry()]);
    sync();
    writeCard(CARD, withManualFields(JSON.parse(read(CARD))));
    const card = read(CARD);

    setEntries([]);
    expect(sync()).toMatchObject({ ...NONE, archived: 1, total: 0 });
    expect(existsSync(p(CARD))).toBe(false);
    expect(read(ARCHIVED)).toBe(card);

    setEntries([entry()]);
    expect(sync()).toMatchObject({ ...NONE, restored: 1, total: 1 });
    expect(read(CARD)).toBe(card);
    expect(existsSync(p(ARCHIVED))).toBe(false);
    expect(sync()).toMatchObject(NONE);

    // Portrait uploads never move.
    expect(tree("src/content/bios-images")).toEqual(uploads);
    expect(history()).toEqual([]);
  });

  it("restores the manual fields and mirrors Word changes made while the entry was gone", () => {
    setEntries([entry()]);
    sync();
    writeCard(CARD, withManualFields(JSON.parse(read(CARD))));
    setEntries([]);
    sync();

    setEntries([entry({ life: "1900-1991" })]);
    expect(sync()).toMatchObject({ ...NONE, restored: 1 });
    const card = JSON.parse(read(CARD));
    expect(card.details.life).toBe("1900-1991");
    expect(card.details.summary).toBe("Manual summary");
    expect(card.roles).toEqual([{ title: "Director-General", organisation: "Manual Org" }]);
    expect(existsSync(p(ARCHIVED))).toBe(false);
  });

  it("never overwrites an archived card: the older copy goes to history", () => {
    setEntries([entry()]);
    sync();
    const live = read(CARD);
    const older = json({ slug: SLUG, portraitImage: "/older.jpg" });
    write(ARCHIVED, older);

    setEntries([]);
    expect(sync()).toMatchObject({ ...NONE, archived: 1 });
    expect(read(ARCHIVED)).toBe(live);
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatch(historyName("archived-superseded"));
    expect(read(`${HISTORY}/${h[0]}`)).toBe(older);
  });

  it("drops a card whose identical copy is already archived, without history", () => {
    setEntries([entry()]);
    sync();
    const live = read(CARD);
    write(ARCHIVED, live);

    setEntries([]);
    expect(sync()).toMatchObject({ ...NONE, archived: 1 });
    expect(existsSync(p(CARD))).toBe(false);
    expect(read(ARCHIVED)).toBe(live);
    expect(history()).toEqual([]);
  });

  it("moves a stale archived copy next to a live card to history; the live card wins", () => {
    setEntries([entry()]);
    sync();
    const manual = withManualFields(JSON.parse(read(CARD)));
    writeCard(CARD, manual);
    const stale = json({ slug: SLUG, portraitImage: "/stale.jpg" });
    write(ARCHIVED, stale);

    expect(sync()).toMatchObject(NONE);
    expect(existsSync(p(ARCHIVED))).toBe(false);
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatch(historyName("archived-stale"));
    expect(read(`${HISTORY}/${h[0]}`)).toBe(stale);
    expect(read(CARD)).toBe(json(manual));
  });

  describe.each(["{bad", "null", "[]"])("an unreadable card (%s)", (body) => {
    it("keeps the live card in history and creates a fresh one", () => {
      setEntries([entry()]);
      write(CARD, body);
      expect(sync()).toMatchObject({ ...NONE, created: 1 });
      expect(JSON.parse(read(CARD)).rolesOverride).toBe(false);
      const h = history();
      expect(h).toHaveLength(1);
      expect(h[0]).toMatch(historyName("live-unreadable"));
      expect(read(`${HISTORY}/${h[0]}`)).toBe(body);
    });

    it("keeps the archived card in history on re-add and creates a fresh one", () => {
      setEntries([entry()]);
      write(ARCHIVED, body);
      expect(sync()).toMatchObject({ ...NONE, created: 1 });
      expect(existsSync(p(ARCHIVED))).toBe(false);
      const h = history();
      expect(h).toHaveLength(1);
      expect(h[0]).toMatch(historyName("archived-unreadable"));
      expect(read(`${HISTORY}/${h[0]}`)).toBe(body);
    });
  });
});
