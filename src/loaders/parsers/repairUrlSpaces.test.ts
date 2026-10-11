import { describe, expect, it } from "vitest";
import { findUrlSplits, repairUrlSpaces } from "./repairUrlSpaces";

// Apply findUrlSplits to a string, for compact assertions.
const fix = (text: string) => {
  const { repair } = findUrlSplits(text);
  return text
    .split("")
    .filter((_, i) => !repair.includes(i))
    .join("");
};
const unclear = (text: string) => findUrlSplits(text).unclear.length;

describe("findUrlSplits: repairs (real cases from the 2026 Word files)", () => {
  it.each([
    // (a) the tail starts with _, / or %
    [
      "www.ilo.org/dyn/triblex/triblexmain.fullText?p _lang=en;",
      "www.ilo.org/dyn/triblex/triblexmain.fullText?p_lang=en;",
    ], // Bustani
    [
      "www.nato.int/cps/en/natolive/who _is_who_7302.htm;",
      "www.nato.int/cps/en/natolive/who_is_who_7302.htm;",
    ], // Carrington
    [
      "www.ilo.org/wcmsp5/groups/public/@dgreports /@dcomm/@publ",
      "www.ilo.org/wcmsp5/groups/public/@dgreports/@dcomm/@publ",
    ], // Phelan
    [
      "www.ip-watch.org/files/Secretariat%20reply%20on %20Idris",
      "www.ip-watch.org/files/Secretariat%20reply%20on%20Idris",
    ], // Idris
    // (b) the tail starts with "." + a host label
    [
      "http://www.lib.utexas .edu/taro/ricewrc/00190/",
      "http://www.lib.utexas.edu/taro/ricewrc/00190/",
    ], // Huxley
    // (c) after / or _, the tail holds address punctuation
    [
      "www.huffpost.com/ entry/saving-culture",
      "www.huffpost.com/entry/saving-culture",
    ], // Bokova
    [
      "www.upi.com/Archives/ 1988/06/09/NATOs",
      "www.upi.com/Archives/1988/06/09/NATOs",
    ], // Carrington
    [
      "www.ditchley.co.uk/1990/ lecture-xxvii;",
      "www.ditchley.co.uk/1990/lecture-xxvii;",
    ], // Carrington
    [
      "www.criticalpast.com/video/65675029407_League-of-Nations_ Avenol-speaks",
      "www.criticalpast.com/video/65675029407_League-of-Nations_Avenol-speaks",
    ], // Avenol
    // (d) after ? or &, the tail holds "="
    [
      "www.academia.org.br/abl/start.htm? infoid=10322&sid=704",
      "www.academia.org.br/abl/start.htm?infoid=10322&sid=704",
    ], // Cavalcanti
    [
      "http://scholarcommons.usf.edu/cgi/viewcontent.cgi?article=4390& context=etd);",
      "http://scholarcommons.usf.edu/cgi/viewcontent.cgi?article=4390&context=etd);",
    ], // McDonald
    // (e) after =
    [
      "www.youtube.com/watch?v= ojj4J8ZLLxE;",
      "www.youtube.com/watch?v=ojj4J8ZLLxE;",
    ], // Vieira de Mello
    // (f) after ".", a host label or a file ending
    [
      "https://janus.lib.cam. ac.uk/db/node.xsp",
      "https://janus.lib.cam.ac.uk/db/node.xsp",
    ], // Carrington
    ["www.nndb. com/people/974/000168470", "www.nndb.com/people/974/000168470"], // Chisholm
    [
      "www.harvardsquarelibrary.org/unitarians/chisholm. html;",
      "www.harvardsquarelibrary.org/unitarians/chisholm.html;",
    ], // Chisholm
    [
      "http://ec.europa.eu/docs/de_larosiere_report_en. pdf;",
      "http://ec.europa.eu/docs/de_larosiere_report_en.pdf;",
    ], // De Larosière
  ])("%s", (input, output) => {
    expect(fix(input)).toBe(output);
  });

  it.each([
    ["www.x.org/photos/ portrait.jpg", "www.x.org/photos/portrait.jpg"],
    ["www.x.org/photos/portrait. jpg", "www.x.org/photos/portrait.jpg"],
  ])("repairs an image address on a Source line: %s", (input, output) => {
    expect(fix(input)).toBe(output);
  });

  it("repairs one address split twice", () => {
    expect(fix("www.x.org/ a-b/ c-d;")).toBe("www.x.org/a-b/c-d;");
  });

  it("repairs an address after an opening bracket", () => {
    expect(fix("(www.huffpost.com/ entry/x)")).toBe(
      "(www.huffpost.com/entry/x)",
    );
  });
});

describe("findUrlSplits: near misses stay as written", () => {
  it.each([
    "available at www.x.org/ (accessed 2 May 2010)",
    "see www.x.org/ and www.y.org/",
    "www.a.org / www.b.org",
    "www.x.org. See also",
    "www.x.org. It was",
    "www.x.org. No. 5",
    "www.x.org/, accessed 2 May 2010",
    "www.x.org/ - accessed 2 May 2010",
    "www.x.org/ J.P. Smith, Title",
    "www.x.org/ e.g. the archive",
    "www.x.org/ ‘Title’ in Journal",
    "www.x.org/ 2010",
    "www.x.org/  double-space",
    "no address/ here-and-there",
    "League-of-Nations_ Avenol-speaks_Alexander",
    "viewcontent.cgi?article=4390& context=etd);",
    "ec.europa.eu/docs/de_larosiere_report_en. pdf;",
    // Abbreviations, page numbers, ranges and dates after a trailing slash.
    "www.x.org/ n.d.",
    "www.x.org/ s.v. Avenol",
    "www.x.org/ Ph.D. thesis",
    "www.x.org/ J.-P. Sartre",
    "www.x.org/ p.5",
    "www.x.org/ No.5",
    "www.x.org/ pp.12-15",
    "www.x.org/ 12-15",
    "www.x.org/ 1945-1960",
    "www.x.org/ 12.03.2010",
    "www.x.org. ca. 1925",
    "www.x.org/ ’Peace-keeping’",
    "www.x.org/ «L’ONU-Genève»",
  ])("%s", (input) => {
    expect(fix(input)).toBe(input);
  });
});

describe("findUrlSplits: unclear cases are reported, not changed", () => {
  it.each([
    "http://library.rice.edu/finding-aids/manuscripts/ 0054;", // Huxley
    "http://catalogue.nla.gov.au/Record/ 4594398.", // Ingram
    "www.norden.org/2008-428/at_download/ publicationfile;", // Unckel
    "www.x.org/ 2010",
  ])("%s", (input) => {
    expect(fix(input)).toBe(input);
    expect(unclear(input)).toBe(1);
  });

  it("stays silent for prose after an address", () => {
    expect(unclear("www.un.org/biography/ and later")).toBe(0);
    expect(unclear("www.un.org/ (all websites accessed 2 May 2010)")).toBe(0);
    expect(unclear("www.un.org/ accessed 2 May 2010")).toBe(0);
    expect(unclear("www.un.org/ retrieved 2 May 2010")).toBe(0);
  });
});

describe("findUrlSplits: known limits", () => {
  it("joins a hyphenated word after a trailing slash", () => {
    // A hyphen-only tail is needed for real cases ("1990/ lecture-xxvii").
    expect(fix("www.x.org/ well-known")).toBe("www.x.org/well-known");
  });

  it("joins 'and/or' after a trailing slash", () => {
    expect(fix("www.x.org/ and/or")).toBe("www.x.org/and/or");
  });

  it("does not detect a space right after the scheme", () => {
    expect(fix("http:// www.x.org")).toBe("http:// www.x.org");
  });
});

const run = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "text",
  text,
  formatting: {},
  ...extra,
});
const para = (...children: any[]) => ({
  type: "paragraph",
  text: children
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join(""),
  children,
});

describe("repairUrlSpaces", () => {
  it("removes the space from the node text and from the run that holds it", () => {
    const content = [para(run("at www.huffpost.com/ "), run("entry/x;"))];
    const { content: out, warnings } = repairUrlSpaces(content);
    expect(out[0].text).toBe("at www.huffpost.com/entry/x;");
    expect(out[0].children.map((c: any) => c.text)).toEqual([
      "at www.huffpost.com/",
      "entry/x;",
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({ code: "url_space_repaired", severity: "info" }),
    ]);
  });

  it("handles a space at the start of the next run", () => {
    const { content: out } = repairUrlSpaces([
      para(
        run("www.huffpost.com/", { formatting: { bold: true } }),
        run(" entry/x"),
      ),
    ]);
    expect(out[0].children.map((c: any) => c.text)).toEqual([
      "www.huffpost.com/",
      "entry/x",
    ]);
    expect(out[0].children[0].formatting).toEqual({ bold: true });
  });

  it("maps several removals across runs, a lone space run included", () => {
    const { content: out, warnings } = repairUrlSpaces([
      para(
        run("www.ilo.org/a/b?p"),
        run(" "),
        run("_lang=en and www.huffpost.com/ entry/x"),
      ),
    ]);
    expect(out[0].text).toBe(
      "www.ilo.org/a/b?p_lang=en and www.huffpost.com/entry/x",
    );
    expect(out[0].children.map((c: any) => c.text)).toEqual([
      "www.ilo.org/a/b?p",
      "",
      "_lang=en and www.huffpost.com/entry/x",
    ]);
    expect(warnings.map((w) => w.code)).toEqual([
      "url_space_repaired",
      "url_space_repaired",
    ]);
  });

  it("reports an unclear split and returns the node unchanged", () => {
    const node = para(run("www.x.org/Record/ 4594398."));
    const { content: out, warnings } = repairUrlSpaces([node]);
    expect(out[0]).toBe(node);
    expect(warnings).toEqual([
      expect.objectContaining({
        code: "url_space_unclear",
        field: "paragraph 0",
        severity: "warn",
      }),
    ]);
  });

  it("ignores note nodes when it matches the runs with the text", () => {
    const note = { type: "note", text: "a footnote", children: [] };
    const { content: out } = repairUrlSpaces([
      para(run("www.huffpost.com/ entry/x"), note),
    ]);
    expect(out[0].text).toBe("www.huffpost.com/entry/x");
    expect(out[0].children[1]).toBe(note);
  });

  it("leaves a node unchanged when its runs do not match its text", () => {
    const node = {
      type: "paragraph",
      text: "www.huffpost.com/ entry/x",
      children: [run("something else")],
    };
    const { content: out, warnings } = repairUrlSpaces([node]);
    expect(out[0]).toBe(node);
    expect(warnings).toEqual([
      expect.objectContaining({ code: "url_space_unclear", severity: "warn" }),
    ]);
  });

  it("covers list and heading nodes and skips tables", () => {
    const list = { ...para(run("www.x.org/ a-b")), type: "list" };
    const heading = { ...para(run("www.x.org/ a-b")), type: "heading" };
    const table = { type: "table", text: "www.x.org/ a-b", children: [] };
    const { content: out } = repairUrlSpaces([list, heading, table]);
    expect(out[0].text).toBe("www.x.org/a-b");
    expect(out[1].text).toBe("www.x.org/a-b");
    expect(out[2]).toBe(table);
  });

  it("never mutates its input and returns unchanged nodes as they are", () => {
    const changed = para(run("www.huffpost.com/ entry/x"));
    const same = para(run("plain text"));
    const snapshot = structuredClone([changed, same]);
    const { content: out } = repairUrlSpaces([changed, same]);
    expect([changed, same]).toEqual(snapshot);
    expect(out[0]).not.toBe(changed);
    expect(out[1]).toBe(same);
  });
});
