import { describe, expect, it } from "vitest";
import { parseRoles } from "./parseRoles";

describe("parseRoles", () => {
  it("extracts a single role title (Annan)", () => {
    const summary =
      "Ghanaian international civil servant and seventh Secretary-General of the United Nations (UN) 1997-2006";
    const { value } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0].title).toBe("Secretary-General");
  });

  it("PHASE-1 KNOWN BUG: keeps only the LAST role from a multi-role summary", () => {
    const summary =
      "Egyptian politician, sixth Secretary-General of the United Nations (UN) 1992-1996 and first Secretary-General of the International Organization of La Francophonie 1997-2002";
    const { value, warnings } = parseRoles(summary);
    expect(value).toHaveLength(1);
    expect(value[0].title).toBe("Secretary-General");
    expect(
      warnings.find((w) => w.code === "role_multiple_truncated"),
    ).toBeTruthy();
  });

  it("PHASE-1 KNOWN BUG: cannot match role names with internal lowercase words (Lubbers)", () => {
    const summary =
      "Dutch politician and ninth United Nations High Commissioner for Refugees of the (UNHCR) 2001-2005";
    const { value, warnings } = parseRoles(summary);
    // "High Commissioner for Refugees" contains "for" lowercase -> current
    // regex won't capture it as a role.
    expect(value).toHaveLength(0);
    expect(warnings.find((w) => w.code === "role_unparsed")).toBeTruthy();
  });

  it("warns on empty input", () => {
    const { value, warnings } = parseRoles("");
    expect(value).toEqual([]);
    expect(warnings.find((w) => w.code === "roles_missing_input")).toBeTruthy();
  });
});
