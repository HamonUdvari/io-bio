// Guards patches/officeparser@6.1.1.patch: <w:pPr><w:rPr> formats the paragraph
// mark (the pilcrow) only; Word never applies it to the text. Unpatched,
// officeparser copied it into every run, so plain paragraphs rendered
// bold/italic on the site (e.g. the last paragraph of Chisholm-B 2014.docx).
// Fails if the patch is lost, e.g. after an officeparser upgrade.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { strToU8, zipSync } from "fflate";
import { OfficeParser } from "officeparser";
import { describe, expect, it } from "vitest";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** A minimal .docx with the given body (and optional styles) XML. */
function docx(body: string, styles = ""): Buffer {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(`${X}<w:document ${W}><w:body>${body}</w:body></w:document>`),
  };
  if (styles) files["word/styles.xml"] = strToU8(`${X}<w:styles ${W}>${styles}</w:styles>`);
  return Buffer.from(zipSync(files));
}

/** Bold / italic / underline of each text run in the first paragraph. */
async function runs(body: string, styles?: string) {
  const p: any = (await OfficeParser.parseOffice(docx(body, styles))).content[0];
  return p.children
    .filter((c: any) => c.type === "text")
    .map((c: any) => ({
      b: !!c.formatting?.bold,
      i: !!c.formatting?.italic,
      u: !!c.formatting?.underline,
    }));
}

const PLAIN = { b: false, i: false, u: false };
const STYLES =
  '<w:style w:type="paragraph" w:styleId="BoldPara"><w:rPr><w:b/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="Small"><w:rPr><w:sz w:val="20"/></w:rPr></w:style>';

describe("officeparser patch: paragraph-mark formatting", () => {
  it("ignores bold/italic/underline that sit only on the paragraph mark", async () => {
    for (const mark of ["<w:b/>", "<w:i/>", '<w:u w:val="single"/>'])
      expect(
        await runs(`<w:p><w:pPr><w:rPr>${mark}</w:rPr></w:pPr><w:r><w:t>t</w:t></w:r></w:p>`),
      ).toEqual([PLAIN]);
  });

  it("keeps direct run formatting", async () => {
    expect(
      await runs(
        "<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>A</w:t></w:r><w:r><w:t>B</w:t></w:r></w:p>",
      ),
    ).toEqual([{ ...PLAIN, b: true }, PLAIN]);
  });

  it("still applies the paragraph style's run formatting", async () => {
    expect(
      await runs('<w:p><w:pPr><w:pStyle w:val="BoldPara"/></w:pPr><w:r><w:t>A</w:t></w:r></w:p>', STYLES),
    ).toEqual([{ ...PLAIN, b: true }]);
  });

  it("honours an explicit run-level off", async () => {
    expect(
      await runs(
        '<w:p><w:pPr><w:pStyle w:val="BoldPara"/></w:pPr><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>A</w:t></w:r></w:p>',
        STYLES,
      ),
    ).toEqual([PLAIN]);
  });

  it("is applied to the browser build too (used by /preview)", () => {
    const require = createRequire(import.meta.url);
    const file = require.resolve("officeparser").replace(/index\.js$/, "officeparser.browser.mjs");
    const unpatched = readFileSync(file, "utf8").includes('if(G){let st=pt(G,"w:rPr")');
    expect(unpatched, "browser build still merges paragraph-mark formatting").toBe(false);
  });
});
