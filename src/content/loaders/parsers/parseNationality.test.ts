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
});
