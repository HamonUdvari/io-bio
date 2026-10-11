import { describe, expect, it } from "vitest";
import { extractAll } from "./extractAll";

const run = (text: string, bold = false) => ({
  type: "text",
  text,
  formatting: bold ? { bold: true } : {},
});
const para = (...children: any[]) => ({
  type: "paragraph",
  text: children.map((c) => c.text).join(""),
  children,
});

describe("extractAll: web addresses split by a stray space", () => {
  // One split address in each zone that reads the text: the Source line, a
  // media note, the biography body and a list section.
  const ast = {
    content: [
      para(run("SMITH, John (1900-1990)")),
      para(),
      para(run("Source: www.x.org/ a-b/photo.jpg")),
      para(run("Film clip www.y.org/ c-d")),
      para(),
      para(run("He worked at www.z.org/ e-f for years.")),
      para(run("LITERATURE: ", true), run("A. Bee, Title, www.w.org/ g-h")),
    ],
    attachments: [{ data: "eA==", name: "image1.jpg", extension: "jpg" }],
  };

  it("shows the same repaired address in every field", () => {
    const { value, warnings } = extractAll(ast);
    expect(value.imageSource).toBe("www.x.org/a-b/photo.jpg");
    expect(value.imageAttachment?.name).toBe("image1.jpg");
    expect(value.introNotes).toContain("Film clip www.y.org/c-d");
    expect(value.body).toContain("www.z.org/e-f");
    expect(value.literature.items.map((i) => i.raw)).toEqual([
      "A. Bee, Title, www.w.org/g-h",
    ]);
    for (const url of [
      "www.x.org/a-b",
      "www.y.org/c-d",
      "www.z.org/e-f",
      "www.w.org/g-h",
    ])
      expect(value.html).toContain(url);
    expect(value.html).not.toMatch(/\.org\/ /);
    expect(
      warnings.filter((w) => w.code === "url_space_repaired"),
    ).toHaveLength(4);
  });
});
