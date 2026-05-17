import { describe, expect, it } from "vitest";
import { parseRoles } from "./parseRoles";

describe("parseRoles", () => {
  it("extracts a single role (Annan)", () => {
    const summary =
      "Ghanaian international civil servant and seventh Secretary-General of the United Nations (UN) 1997-2006";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      ordinalText: "seventh",
      title: "Secretary-General",
      organisation: "United Nations",
      abbreviation: "UN",
      startYear: 1997,
      endYear: 2006,
    });
  });

  it("extracts BOTH roles from a multi-role summary (Boutros-Ghali)", () => {
    const summary =
      "Egyptian politician, sixth Secretary-General of the United Nations (UN) 1992-1996 and first Secretary-General of the International Organization of La Francophonie 1997-2002";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(2);

    expect(value[0]).toMatchObject({
      ordinalText: "sixth",
      title: "Secretary-General",
      organisation: "United Nations",
      abbreviation: "UN",
      startYear: 1992,
      endYear: 1996,
    });
    expect(value[1]).toMatchObject({
      ordinalText: "first",
      title: "Secretary-General",
      organisation: "International Organization of La Francophonie",
      startYear: 1997,
      endYear: 2002,
    });
    expect(value[1].abbreviation).toBeUndefined();
  });

  it("extracts BOTH roles when org name contains 'and' (De Larosière)", () => {
    const summary =
      "French civil servant and sixth Managing Director of the International Monetary Fund (IMF) 1978-1987 and second President of the European Bank for Reconstruction and Development (EBRD) 1993-1998";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(2);

    expect(value[0]).toMatchObject({
      ordinalText: "sixth",
      title: "Managing Director",
      organisation: "International Monetary Fund",
      abbreviation: "IMF",
      startYear: 1978,
      endYear: 1987,
    });
    expect(value[1]).toMatchObject({
      ordinalText: "second",
      title: "President",
      organisation: "European Bank for Reconstruction and Development",
      abbreviation: "EBRD",
      startYear: 1993,
      endYear: 1998,
    });
  });

  it("captures mixed-case role names like 'High Commissioner for Refugees' (Lubbers)", () => {
    const summary =
      "Dutch politician and ninth United Nations High Commissioner for Refugees of the (UNHCR) 2001-2005";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      ordinalText: "ninth",
      title: "United Nations High Commissioner for Refugees",
      abbreviation: "UNHCR",
      startYear: 2001,
      endYear: 2005,
    });
  });

  it("warns when no year span found", () => {
    const { value, warnings } = parseRoles("some unrelated text");
    expect(value).toEqual([]);
    expect(warnings.find((w) => w.code === "roles_no_year_span")).toBeTruthy();
  });

  it("warns on empty input", () => {
    const { value, warnings } = parseRoles("");
    expect(value).toEqual([]);
    expect(warnings.find((w) => w.code === "roles_missing_input")).toBeTruthy();
  });
});
