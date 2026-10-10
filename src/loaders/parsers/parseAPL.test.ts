import { describe, expect, it } from "vitest";
import { extractSectionNodes, parseAPLItems, splitAPLText } from "./parseAPL";

describe("parseAPLItems", () => {
  it("splits a single-paragraph literature section by semicolons", () => {
    const raw =
      "M.F. Imber, The USA, ILO, UNESCO and IAEA, London 1989; M. Abley, 'Time for Change', 1998; A. Smith, 'Another Article', 2000";
    const { items, websitesAccessedOn } = parseAPLItems(raw);
    expect(items).toHaveLength(3);
    expect(items[0].raw).toBe(
      "M.F. Imber, The USA, ILO, UNESCO and IAEA, London 1989",
    );
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
      raws(
        "Papers are located at the UN Archives (http://archives.un.org; search term ‘Gardiner’).",
      ),
    ).toEqual([
      "Papers are located at the UN Archives (http://archives.un.org; search term ‘Gardiner’)",
    ]);
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
    expect(
      raws("A (with X; B, 1995; C (Lecture, 2003) at www.y.org/z); D, 2004"),
    ).toEqual([
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
    expect(
      raws("A (with X; B, 1995; C, 2003 at www.y.org/z); D, 2004"),
    ).toEqual(["A (with X; B, 1995; C, 2003 at www.y.org/z)", "D, 2004"]);
  });

  it("falls back to the plain split when brackets don't balance", () => {
    // A stray ")" (as in a few source docs) or an unclosed "(".
    expect(raws("A, 1990); B (x; y), 1995; C")).toEqual([
      "A, 1990)",
      "B (x",
      "y), 1995",
      "C",
    ]);
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
    expect(
      raws("See http://archives.nato.int/;search?query=X; B, 1995"),
    ).toEqual(["See http://archives.nato.int/;search?query=X", "B, 1995"]);
  });

  it("strips trailing punctuation as before", () => {
    expect(raws("A (x; y).; B.")).toEqual(["A (x; y)", "B"]);
  });

  it("matches the previous split on text without brackets", () => {
    for (const s of [
      "A; B; C",
      "A;  B;",
      "A;\tB",
      "A;\u00a0B",
      "A;\nB",
      "x;y; z",
      "",
      ";",
      "A; ; B",
    ])
      expect(splitAPLText(s).map((p) => p.trim())).toEqual(
        s.split(/;(?:\s+|$)/).map((p) => p.trim()),
      );
  });
});

describe("semicolons inside quoted titles", () => {
  const raws = (text: string) => parseAPLItems(text).items.map((i) => i.raw);

  it("keeps a headline and its subtitle in one item (Cole)", () => {
    expect(
      raws(
        "J.D. Morris, ‘Cole of New York Heads Atom Group; 2-Month Deadlock Is Broken as Chairmanship of Joint Unit Goes to House Member’ in The New York Times, 2 April 1953, 14; B, 1995",
      ),
    ).toEqual([
      "J.D. Morris, ‘Cole of New York Heads Atom Group; 2-Month Deadlock Is Broken as Chairmanship of Joint Unit Goes to House Member’ in The New York Times, 2 April 1953, 14",
      "B, 1995",
    ]);
  });

  it("doesn't end the title at an apostrophe (Orfila)", () => {
    expect(
      raws(
        "D. Langdon, ‘The Orfilas Don’t Have to Look for the Party; If It’s in D.C., They’re Probably Giving It’ in People’s Magazine, 6 August 1976; B, 1995",
      ),
    ).toEqual([
      "D. Langdon, ‘The Orfilas Don’t Have to Look for the Party; If It’s in D.C., They’re Probably Giving It’ in People’s Magazine, 6 August 1976",
      "B, 1995",
    ]);
  });

  it("allows a nested double-quoted name (Spaak)", () => {
    expect(
      raws(
        "W.H. Waggoner, ‘“Mr. Europe” Surveys the Future; Paul-Henri Spaak, the new Secretary General of NATO’ in The New York Times Magazine, 7 April 1957, 14+; B, 1995",
      ),
    ).toEqual([
      "W.H. Waggoner, ‘“Mr. Europe” Surveys the Future; Paul-Henri Spaak, the new Secretary General of NATO’ in The New York Times Magazine, 7 April 1957, 14+",
      "B, 1995",
    ]);
  });

  it("keeps the ';' before a plural possessive that ends the title early (Annan)", () => {
    // "Nations’ " reads as the title's end; the ';' before it is still inside.
    expect(
      raws(
        "‘Strategies for World Peace: The View of the UN Secretary-General; The United Nations’ Priorities for the Future’ in The Futurist, 36/3, May 2002, 18-21; B, 1995",
      ),
    ).toEqual([
      "‘Strategies for World Peace: The View of the UN Secretary-General; The United Nations’ Priorities for the Future’ in The Futurist, 36/3, May 2002, 18-21",
      "B, 1995",
    ]);
  });

  it("still splits after an unclosed quote followed by another quote (Clausen)", () => {
    expect(
      raws(
        "C.H. Farnsworth, ‘Clausen Soothes Foes, Keeps Backers in The New York Times, 12 April 1982, D1, D8; A. Pine, ‘Clausen Holds World Bank’s Course’ in The Wall Street Journal, 13 May 1982",
      ),
    ).toEqual([
      "C.H. Farnsworth, ‘Clausen Soothes Foes, Keeps Backers in The New York Times, 12 April 1982, D1, D8",
      "A. Pine, ‘Clausen Holds World Bank’s Course’ in The Wall Street Journal, 13 May 1982",
    ]);
  });

  it("still splits after an unclosed quote followed by a bracket (Prebisch)", () => {
    expect(
      raws(
        "M. Vernengo, ‘Portrait of the Economist as a Young Man: Raúl Prebisch’s Evolving Views, 1919-1949; in CEPAL Review, 106, April 2012, 7-21; M.E. Margulis (Ed.), The Global Political Economy of Raúl Prebisch, London 2017",
      ),
    ).toEqual([
      "M. Vernengo, ‘Portrait of the Economist as a Young Man: Raúl Prebisch’s Evolving Views, 1919-1949",
      "in CEPAL Review, 106, April 2012, 7-21",
      "M.E. Margulis (Ed.), The Global Political Economy of Raúl Prebisch, London 2017",
    ]);
  });

  it("cancels the title at a bracket before its end", () => {
    expect(raws("‘A; B (x) C’ in D; E")).toEqual(["‘A", "B (x) C’ in D", "E"]);
  });

  it("doesn't end the title at a ’ before a digit", () => {
    expect(raws("‘The ’60s; A Decade’ in X; Y")).toEqual([
      "‘The ’60s; A Decade’ in X",
      "Y",
    ]);
  });

  it("doesn't end the title at a ’ inside a nested double quote", () => {
    expect(raws("‘The “Peoples’ Court”; A Study’ in X; Y")).toEqual([
      "‘The “Peoples’ Court”; A Study’ in X",
      "Y",
    ]);
  });

  it("known limit: a forgotten ’ plus a later plural possessive reads as one title", () => {
    // No other ‘ or bracket in between; no current source doc has this.
    expect(raws("A, ‘Title in X, 1990; B, The Peoples’ Bank, 1991; C")).toEqual(
      ["A, ‘Title in X, 1990; B, The Peoples’ Bank, 1991", "C"],
    );
  });

  it("still splits when a stray closing double quote leaves the nesting unbalanced", () => {
    expect(raws("‘A ” B; C’ in D; E")).toEqual(["‘A ” B", "C’ in D", "E"]);
  });

  it("keeps the plain split when the section's brackets don't balance", () => {
    expect(raws("‘A; B’ in C); D")).toEqual(["‘A", "B’ in C)", "D"]);
  });

  it("ignores straight quotes", () => {
    expect(raws("'A; B' in C; D")).toEqual(["'A", "B' in C", "D"]);
  });
});

describe("extractSectionNodes: where a section ends", () => {
  // Fresh nodes per test: extractSectionNodes strips the label from the head.
  const text = (t: string, bold = false) => ({
    type: "text",
    text: t,
    formatting: bold ? { bold: true } : {},
  });
  const image = () => ({ type: "image", text: "" });
  const para = (...children: any[]) => ({
    type: "paragraph",
    text: children.map((c) => c.text ?? "").join(""),
    children,
  });
  const head = () => para(text("PUBLICATIONS", true), text(": A; B"));

  it("ends at a bold label that follows image-only runs (Sadik)", () => {
    const content = [
      head(),
      para(image(), image(), image(), text("LITERATURE", true), text(": C; D")),
    ];
    const s = extractSectionNodes(content, "PUBLICATIONS");
    expect(s.consumed).toEqual([0]);
    expect(s.rawText).toBe("A; B");
  });

  it("continues past a bold whitespace-only run followed by plain text", () => {
    const content = [head(), para(text(" ", true), text("C; D"))];
    const s = extractSectionNodes(content, "PUBLICATIONS");
    expect(s.consumed).toEqual([0, 1]);
    expect(s.rawText).toBe("A; B C; D");
  });

  it("ends at a bold label that follows a blank plain run", () => {
    const content = [
      head(),
      para(text(" "), text("LITERATURE", true), text(": C")),
    ];
    const s = extractSectionNodes(content, "PUBLICATIONS");
    expect(s.consumed).toEqual([0]);
  });

  it("continues past plain and empty paragraphs, and ends at the next bold one", () => {
    const content = [
      head(),
      para(text("C;")),
      para(),
      para(text("LITERATURE", true), text(": E")),
    ];
    const s = extractSectionNodes(content, "PUBLICATIONS");
    expect(s.consumed).toEqual([0, 1, 2]);
    expect(s.rawText).toBe("A; B C;");
  });
});

describe("other wordings of the websites footer", () => {
  const parse = (text: string) => {
    const r = parseAPLItems(text);
    return {
      items: r.items.map((i) => i.raw),
      accessedOn: r.websitesAccessedOn,
      note: r.websitesNote,
    };
  };

  it("keeps the standard footer as websitesAccessedOn only", () => {
    expect(
      parse(
        "A, 1990; B, www.x.org (all websites accessed  on 12 September 2017).",
      ),
    ).toEqual({
      items: ["A, 1990", "B, www.x.org"],
      accessedOn: "on 12 September 2017",
      note: undefined,
    });
  });

  it.each([
    [
      "square brackets (Avenol)",
      "A, 1999; http://rulers.org/indexa5.html [all accessed 15 June 2011].",
      "[all accessed 15 June 2011]",
    ],
    [
      "visited (Rooth)",
      "A, 2024, https://doi.org/10.1/2 (all websites visited at 29 August 2025).",
      "(all websites visited at 29 August 2025)",
    ],
    [
      "approached (La Guardia)",
      "A, https://unfoundation.org/blog/, 1 October 2015 (all websites approached on 20 July 2026)",
      "(all websites approached on 20 July 2026)",
    ],
    [
      "a note with a ';' (Curchod)",
      "A, www.itu.int/x (translations by the authors; all websites, including the ITU Digital Collections, at www.itu.int/en/history, accessed on 7 August 2017).",
      "(translations by the authors; all websites, including the ITU Digital Collections, at www.itu.int/en/history, accessed on 7 August 2017)",
    ],
  ])("shows %s as written", (_, text, note) => {
    const r = parse(text);
    expect(r.note).toBe(note);
    expect(r.accessedOn).toBeUndefined();
    // Only the note leaves the list.
    expect(r.items.join("; ")).toBe(
      text.slice(0, text.lastIndexOf(note)).trim(),
    );
  });

  it.each([
    [
      "a note without 'all' (Michiels)",
      "A, 1990; ‘L.P.M.H. baron Michiels’ available at www.parlement.com/x (website accessed on 18 February 2019).",
    ],
    ["a closing role note", "A, 1990; B (Editor)"],
    [
      "a note with 'all' but no websites verb",
      "A, 1990; B, Collected Works, Oslo 1930 (all volumes)",
    ],
    [
      "'accessed' without 'all'",
      "A, 1990; B, www.x.org (accessed 12 February 2014)",
    ],
    ["mismatched brackets", "A, 1990; B (all websites accessed on 1 May 2020]"],
    [
      "a note where 'all' is not about the websites",
      "A, 1990; B, Oxford (All Souls College, visited 12 May 1990)",
    ],
  ])("leaves %s in its item", (_, text) => {
    const r = parse(text);
    expect(r.note).toBeUndefined();
    expect(r.accessedOn).toBeUndefined();
    expect(r.items.join("; ")).toBe(text.replace(/\.$/, ""));
  });
});
