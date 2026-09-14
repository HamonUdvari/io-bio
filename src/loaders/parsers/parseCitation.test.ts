import { describe, expect, it } from "vitest";
import { parseCitation } from "./parseCitation";

// A minimal "How to cite" citation paragraph, parameterised on the editors tail.
// Mirrors the source docs: AUTHOR, 'LAST, First' in IO BIO, Biographical
// Dictionary …, Edited by <EDITORS>, www.ru.nl/fm/iobio, Accessed DAY MONTH YEAR.
const cite = (editors: string) => ({
  type: "paragraph",
  text:
    `Daniel Maul, 'Morse, David Abner' in IO BIO, Biographical Dictionary of ` +
    `Secretaries-General of International Organizations, Edited by ${editors}, ` +
    `www.ru.nl/fm/iobio, Accessed DAY MONTH YEAR`,
});

describe("parseCitation — editors", () => {
  it("extracts the editors from the How-to-cite line", () => {
    const { value } = parseCitation([
      cite("Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg"),
    ]);
    expect(value.editors).toBe(
      "Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg",
    );
    // The whole citation paragraph is still consumed (never leaks into the body).
    expect(value.consumed).toContain(0);
  });

  // Pure extraction: names come through verbatim (the docx is the source of
  // truth). Only generic whitespace is tidied — no name spellings are corrected.
  it("extracts editor names verbatim, without correcting spellings", () => {
    const { value } = parseCitation([
      cite("Bob Reinalda, Kent J. Kille and Jaci Eisenberg"),
    ]);
    expect(value.editors).toBe("Bob Reinalda, Kent J. Kille and Jaci Eisenberg");
  });

  it("collapses run-boundary double spaces only", () => {
    const { value } = parseCitation([
      cite("Bob Reinalda, Kent J. Kille and Jaci L.  Eisenberg"),
    ]);
    expect(value.editors).toBe(
      "Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg",
    );
  });

  it("passes through a genuinely different editor list unchanged", () => {
    const { value } = parseCitation([cite("Jane Roe and John Q. Public")]);
    expect(value.editors).toBe("Jane Roe and John Q. Public");
  });

  it("keeps an 'et al.' abbreviation in the extracted prose", () => {
    const { value } = parseCitation([cite("Bob Reinalda et al.")]);
    expect(value.editors).toBe("Bob Reinalda et al.");
  });

  it("returns null editors + an info warning when there is no 'Edited by'", () => {
    const noEditors = {
      type: "paragraph",
      text:
        "Daniel Maul, 'Morse, David Abner' in IO BIO, Biographical Dictionary " +
        "of Secretaries-General of International Organizations, " +
        "www.ru.nl/fm/iobio, Accessed DAY MONTH YEAR",
    };
    const { value, warnings } = parseCitation([noEditors]);
    expect(value.editors).toBeNull();
    expect(warnings.some((w) => w.code === "editors_missing")).toBe(true);
  });

  it("still extracts authors alongside editors", () => {
    const { value } = parseCitation([
      cite("Bob Reinalda, Kent J. Kille and Jaci L. Eisenberg"),
    ]);
    expect(value.authors).toBe("Daniel Maul");
  });
});
