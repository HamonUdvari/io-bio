import { describe, expect, it } from "vitest";
import { parseYears } from "./parseYears";

describe("parseYears", () => {
  it("extracts first NNNN-NNNN span", () => {
    const { value } = parseYears(
      "seventh Secretary-General of the United Nations (UN) 1997-2006",
    );
    expect(value.startYear).toBe(1997);
    expect(value.endYear).toBe(2006);
  });

  it("works on Lubbers-style 'High Commissioner ... 2001-2005'", () => {
    const { value } = parseYears(
      "ninth United Nations High Commissioner for Refugees of the (UNHCR) 2001-2005",
    );
    expect(value.startYear).toBe(2001);
    expect(value.endYear).toBe(2005);
  });

  it("returns first span when multiple are present (legacy)", () => {
    const { value } = parseYears(
      "sixth Secretary-General of the UN 1992-1996 and first SG of Francophonie 1997-2002",
    );
    expect(value.startYear).toBe(1992);
    expect(value.endYear).toBe(1996);
  });

  it("warns when no span found", () => {
    const { value, warnings } = parseYears("no years here");
    expect(value.startYear).toBeNull();
    expect(value.endYear).toBeNull();
    expect(warnings.find((w) => w.code === "years_unparsed")).toBeTruthy();
  });
});
