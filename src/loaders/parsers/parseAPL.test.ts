import { describe, expect, it } from "vitest";
import { parseAPLItems, splitAPLText } from "./parseAPL";

describe("parseAPLItems", () => {
  it("splits a single-paragraph literature section by semicolons", () => {
    const raw =
      "M.F. Imber, The USA, ILO, UNESCO and IAEA, London 1989; M. Abley, 'Time for Change', 1998; A. Smith, 'Another Article', 2000";
    const { items, websitesAccessedOn } = parseAPLItems(raw);
    expect(items).toHaveLength(3);
    expect(items[0].raw).toBe("M.F. Imber, The USA, ILO, UNESCO and IAEA, London 1989");
    expect(items[1].raw).toBe("M. Abley, 'Time for Change', 1998");
    expect(items[2].raw).toBe("A. Smith, 'Another Article', 2000");
    expect(websitesAccessedOn).toBeUndefined();
  });

  it("peels off '(all websites accessed ...)' footer", () => {
    const raw =
      "K. Gladdish, Governing from the Centre, London 1991; R. Ammerlaan (Ed.), Afscheid van Ruud Lubbers, 1989 (all websites accessed 12 September 2017).";
    const { items, websitesAccessedOn } = parseAPLItems(raw);
    expect(websitesAccessedOn).toBe("12 September 2017");
    expect(items).toHaveLength(2);
    expect(items[1].raw).toBe(
      "R. Ammerlaan (Ed.), Afscheid van Ruud Lubbers, 1989",
    );
  });

  it("returns empty list for empty input", () => {
    const { items } = parseAPLItems("");
    expect(items).toEqual([]);
  });

  it("filters out empty entries between semicolons", () => {
    const { items } = parseAPLItems("A, 1990;  ; B, 1995;");
    expect(items.map((i) => i.raw)).toEqual(["A, 1990", "B, 1995"]);
  });
});

describe("semicolons inside brackets", () => {
  const raws = (text: string) => parseAPLItems(text).items.map((i) => i.raw);

  it("keeps a bracketed volume list in one item (Nansen)", () => {
    expect(
      raws(
        "Farthest North, London 1897; Brev, Oslo 1961-1971 (5 volumes, edited by S. Kjaerheim: 1882-1895; 1896-1905; 1906-1918; 1919-1925; 1926-1930); Nansen, Oslo 1930",
      ),
    ).toEqual([
      "Farthest North, London 1897",
      "Brev, Oslo 1961-1971 (5 volumes, edited by S. Kjaerheim: 1882-1895; 1896-1905; 1906-1918; 1919-1925; 1926-1930)",
      "Nansen, Oslo 1930",
    ]);
  });

  it("keeps a URL and its search note in one item (Gardiner)", () => {
    expect(
      raws("Papers are located at the UN Archives (http://archives.un.org; search term ‘Gardiner’)."),
    ).toEqual(["Papers are located at the UN Archives (http://archives.un.org; search term ‘Gardiner’)"]);
  });

  it("handles square brackets", () => {
    expect(raws("A [with notes; more notes], 1990; B, 1995")).toEqual([
      "A [with notes; more notes], 1990",
      "B, 1995",
    ]);
  });

  it("only keeps a ';' inside a SIMPLE bracketed note (no bracket inside it)", () => {
    // The inner simple note stays whole; the outer, nested one still splits.
    expect(raws("A (vol. 1 (1990; 1991); vol. 2), 1992; B, 1995")).toEqual([
      "A (vol. 1 (1990; 1991)",
      "vol. 2), 1992",
      "B, 1995",
    ]);
    // A forgotten ")" + a later stray ")" with another note in between: no merge.
    expect(raws("A (with X; B, 1995; C (Lecture, 2003) at www.y.org/z); D, 2004")).toEqual([
      "A (with X",
      "B, 1995",
      "C (Lecture, 2003) at www.y.org/z)",
      "D, 2004",
    ]);
    // Mismatched bracket types don't count as a note.
    expect(raws("A (x; y]; B")).toEqual(["A (x", "y]", "B"]);
  });

  it("known limit: a forgotten ')' plus a later stray ')' reads as one note", () => {
    // No other bracket in between, so the brackets balance; structure alone
    // can't tell. No current source doc has this; no text is lost.
    expect(raws("A (with X; B, 1995; C, 2003 at www.y.org/z); D, 2004")).toEqual([
      "A (with X; B, 1995; C, 2003 at www.y.org/z)",
      "D, 2004",
    ]);
  });

  it("falls back to the plain split when brackets don't balance", () => {
    // A stray ")" (as in a few source docs) or an unclosed "(".
    expect(raws("A, 1990); B (x; y), 1995; C")).toEqual(["A, 1990)", "B (x", "y), 1995", "C"]);
    expect(raws("A (open; B, 1995; C")).toEqual(["A (open", "B, 1995", "C"]);
    // The real shape: the stray ")" comes after earlier items and notes.
    expect(raws("A; B (x; y), 1990; C, www.z.org); D")).toEqual([
      "A",
      "B (x",
      "y), 1990",
      "C, www.z.org)",
      "D",
    ]);
  });

  it("still keeps a URL that contains ';' whole", () => {
    expect(raws("See http://archives.nato.int/;search?query=X; B, 1995")).toEqual([
      "See http://archives.nato.int/;search?query=X",
      "B, 1995",
    ]);
  });

  it("strips trailing punctuation as before", () => {
    expect(raws("A (x; y).; B.")).toEqual(["A (x; y)", "B"]);
  });

  it("matches the previous split on text without brackets", () => {
    for (const s of ["A; B; C", "A;  B;", "A;\tB", "A;\u00a0B", "A;\nB", "x;y; z", "", ";", "A; ; B"])
      expect(splitAPLText(s).map((p) => p.trim())).toEqual(
        s.split(/;(?:\s+|$)/).map((p) => p.trim()),
      );
  });
});
