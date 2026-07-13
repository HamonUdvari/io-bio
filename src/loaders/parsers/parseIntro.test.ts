import { describe, expect, it } from "vitest";
import { parseIntro } from "./parseIntro";

describe("parseIntro", () => {
  it("extracts name, summary, life from an Annan-style intro", () => {
    const intro =
      "ANNAN, Kofi Atta, Ghanaian international civil servant and seventh Secretary-General of the United Nations (UN) 1997-2006, was born 8 April 1938 in Kumasi, Gold Coast (now Ghana) and passed away 18 August 2018 in Bern, Switzerland.";
    const { value, warnings } = parseIntro(intro);

    expect(value.lastName).toBe("Annan");
    expect(value.firstName).toBe("Kofi Atta");
    expect(value.knownAs).toBeUndefined();
    expect(value.summary).toBe(
      "Ghanaian international civil servant and seventh Secretary-General of the United Nations (UN) 1997-2006",
    );
    expect(value.life).toMatch(/^Was born 8 April 1938/);
    expect(warnings).toEqual([]);
  });

  it("extracts knownAs when intro has '(known as ...)' aside", () => {
    const intro =
      "LUBBERS, Rudolphus Franciscus Marie (known as Ruud), Dutch politician and ninth United Nations High Commissioner for Refugees of the (UNHCR) 2001-2005, was born 7 May 1939 in Rotterdam, the Netherlands.";
    const { value } = parseIntro(intro);
    expect(value.lastName).toBe("Lubbers");
    expect(value.firstName).toBe("Rudolphus Franciscus Marie");
    expect(value.knownAs).toBe("Ruud");
  });

  it("captures a 'née' maiden name in its own field (not knownAs)", () => {
    const intro =
      "BRUNDTLAND, Gro (née Harlem), Norwegian physician and director-general of the World Health Organization (WHO) 1998-2003, was born 20 April 1939 in Bærum, Norway.";
    const { value } = parseIntro(intro);
    expect(value.lastName).toBe("Brundtland");
    expect(value.firstName).toBe("Gro");
    expect(value.nee).toBe("Harlem");
    expect(value.knownAs).toBeUndefined();
  });

  it("handles entry with multiple roles in summary", () => {
    const intro =
      "BOUTROS-GHALI, Boutros Youssef, Egyptian politician, sixth Secretary-General of the United Nations (UN) 1992-1996 and first Secretary-General of the International Organization of La Francophonie 1997-2002, was born 14 November 1922 in Cairo, Egypt.";
    const { value } = parseIntro(intro);
    expect(value.lastName).toBe("Boutros-Ghali");
    expect(value.firstName).toBe("Boutros Youssef");
    expect(value.summary).toContain("sixth Secretary-General");
    expect(value.summary).toContain("first Secretary-General");
  });

  it("title-cases life sentence first character", () => {
    const intro =
      "DOE, Jane, Some role, was born 1 January 2000 in Some Town, Some Country.";
    const { value } = parseIntro(intro);
    expect(value.life?.charAt(0)).toBe("W");
  });

  it("emits warning when intro text is empty", () => {
    const { value, warnings } = parseIntro("");
    expect(value.firstName).toBeNull();
    expect(value.lastName).toBeNull();
    expect(warnings.find((w) => w.code === "intro_missing")).toBeTruthy();
  });

  it("emits warning when name is unparseable", () => {
    const { warnings } = parseIntro("This is not a valid intro at all");
    expect(warnings.find((w) => w.code === "name_unparsed")).toBeTruthy();
  });
});
