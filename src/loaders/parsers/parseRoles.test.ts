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

  it("back-fills UNHCR org/abbr when role title is 'High Commissioner for Refugees' without parenthesised abbr", () => {
    const summary =
      "Norwegian politician and seventh United Nations High Commissioner for Refugees 1990-1991";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      ordinalText: "seventh",
      title: "United Nations High Commissioner for Refugees",
      organisation:
        "Office of the United Nations High Commissioner for Refugees",
      abbreviation: "UNHCR",
    });
  });

  it("back-fills OHCHR org/abbr when role title is 'High Commissioner for Human Rights' (Robinson)", () => {
    const summary =
      "second United Nations High Commissioner for Human Rights 1997-2002";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      title: "United Nations High Commissioner for Human Rights",
      organisation:
        "Office of the United Nations High Commissioner for Human Rights",
      abbreviation: "OHCHR",
    });
  });

  it("accepts 'to' as the title/org separator (Stokes)", () => {
    const summary =
      "military engineer and the first British Delegate to the European Commission of the Danube 1856-1871";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      ordinalText: "first",
      // The author wrote "British Delegate" as a qualified title (vs. delegates
      // of other nationalities), so the demonym stays in the title.
      title: "British Delegate",
      organisation: "European Commission of the Danube",
      startYear: 1856,
      endYear: 1871,
    });
  });

  it("tolerates a stray comma between (ABBR) and the year span (Stikker, Prebisch)", () => {
    const summary =
      "Dutch politician and third Secretary General of the North Atlantic Treaty Organization (NATO), 1961-1964";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      ordinalText: "third",
      title: "Secretary General",
      organisation: "North Atlantic Treaty Organization",
      abbreviation: "NATO",
      startYear: 1961,
      endYear: 1964,
    });
  });

  it("does not override an abbreviation already present in the docx text", () => {
    const summary =
      "ninth United Nations High Commissioner for Refugees of the (UNHCR) 2001-2005";
    const { value } = parseRoles(summary);
    expect(value[0].abbreviation).toBe("UNHCR");
  });

  // issue #10: acronyms with an internal space were dropped (the old matcher
  // only captured a single all-caps word).
  it("extracts an acronym with an internal space, e.g. (UN ECA) (Gardiner)", () => {
    const { value } = parseRoles(
      "Ghanaian civil servant and Executive Secretary of the United Nations Economic Commission for Africa (UN ECA) 1962-1975",
    );
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      title: "Executive Secretary",
      organisation: "United Nations Economic Commission for Africa",
      abbreviation: "UN ECA",
    });
  });

  // issue #10: a mid-name acronym (not the trailing token) was left embedded in
  // the org name with an empty abbreviation field.
  it("extracts a mid-name acronym and strips it from the org (de Boer: UNFCCC)", () => {
    const { value } = parseRoles(
      "Dutch civil servant and Executive Secretary of the United Nations Framework Convention on Climate Change (UNFCCC) Secretariat 2006-2010",
    );
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      title: "Executive Secretary",
      organisation:
        "United Nations Framework Convention on Climate Change Secretariat",
      abbreviation: "UNFCCC",
    });
  });

  // issue #10: a mixed-case acronym must still be captured (>=2 uppercase rule),
  // while ordinary parentheticals like "(acting)" are not.
  it("captures a mixed-case acronym like (BofA) (Clausen)", () => {
    const { value } = parseRoles(
      "American banker, President of Bank of America (BofA) 1970-1981",
    );
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      title: "President",
      organisation: "Bank of America",
      abbreviation: "BofA",
    });
  });

  // issue #10: the UNHCR/OHCHR "role-as-institution" back-fill must NOT override
  // a role whose organisation is explicitly named (the League of Nations' High
  // Commissioner for Refugees is not UNHCR).
  it("does not graft UNHCR onto a role with an explicit organisation (McDonald: League of Nations)", () => {
    const { value } = parseRoles(
      "American foreign policy expert and High Commissioner for Refugees Coming from Germany of the League of Nations 1933-1935",
    );
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      title: "High Commissioner for Refugees Coming from Germany",
      organisation: "League of Nations",
    });
    expect(value[0].abbreviation).toBeUndefined();
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
