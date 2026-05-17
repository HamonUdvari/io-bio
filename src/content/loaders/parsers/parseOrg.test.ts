import { describe, expect, it } from "vitest";
import { parseOrg } from "./parseOrg";

describe("parseOrg", () => {
  it("extracts parenthesised abbreviation", () => {
    const { value } = parseOrg(
      "seventh Secretary-General of the United Nations (UN) 1997-2006",
    );
    expect(value.organisation).toBe("UN");
  });

  it("falls back to ios.json when no parenthesised abbr", () => {
    const { value } = parseOrg(
      "third Director-General of the World Health Organization",
    );
    expect(value.organisation).toBe("WHO");
  });

  it("warns when no organisation found", () => {
    const { value, warnings } = parseOrg("some unrelated text");
    expect(value.organisation).toBeNull();
    expect(warnings.find((w) => w.code === "org_unknown")).toBeTruthy();
  });
});
