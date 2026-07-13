import { describe, expect, it } from "vitest";
import { parseNationality } from "./parseNationality";

describe("parseNationality", () => {
  it("extracts country and male demonym", () => {
    const { value } = parseNationality(
      "Ghanaian international civil servant and seventh Secretary-General",
    );
    expect(value.country).toBe("Ghana");
    expect(value.nationality).toBe("Ghanaian");
  });

  it("extracts another country", () => {
    const { value } = parseNationality(
      "Egyptian politician, sixth Secretary-General of the United Nations",
    );
    expect(value.country).toBe("Egypt");
    expect(value.nationality).toBe("Egyptian");
  });

  it("warns when no demonym matches", () => {
    const { value, warnings } = parseNationality("just some random text");
    expect(value.country).toBeNull();
    expect(value.nationality).toBeNull();
    expect(warnings.find((w) => w.code === "nationality_unknown")).toBeTruthy();
  });

  // issue #10: pick the demonym appearing EARLIEST in the text, so a demonym
  // that is only a substring of a LATER word ("German" inside "…Germany") no
  // longer beats the actual leading demonym.
  it("picks the leading demonym, not a substring of a later word (McDonald: American, not German⊂Germany)", () => {
    const { value } = parseNationality(
      "American foreign policy expert and League of Nations High Commissioner for Refugees Coming from Germany",
    );
    expect(value.country).toBe("United States");
    expect(value.nationality).toBe("American");
  });

  // issue #10: the leading demonym wins even when a later word contains another
  // country's demonym (here "South American" ⊃ "American"), AND the demonym is
  // rendered AS WRITTEN in the source — the world-countries DB stores
  // "Argentine" but Kirchner's author wrote "Argentinean".
  it("prefers the leading demonym and renders the source spelling (Kirchner: Argentinean)", () => {
    const { value } = parseNationality(
      "Argentinean politician and first Secretary-General of the Union of South American Nations",
    );
    expect(value.country).toBe("Argentina");
    expect(value.nationality).toBe("Argentinean");
  });

  // ...but when the source uses the DB spelling verbatim, it is left as-is
  // (Orfila wrote "Argentine"), so the rendered form always matches the source.
  it("keeps the DB demonym when the source uses it verbatim (Orfila: Argentine)", () => {
    const { value } = parseNationality(
      "Argentine diplomat and fifth Secretary General of the Organization of American States",
    );
    expect(value.country).toBe("Argentina");
    expect(value.nationality).toBe("Argentine");
  });
});
