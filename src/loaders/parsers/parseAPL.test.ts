import { describe, expect, it } from "vitest";
import { parseAPLItems } from "./parseAPL";

describe("parseAPLItems", () => {
  it("splits a single-paragraph literature section by semicolons", () => {
    const raw =
      "M.F. Imber, The USA, ILO, UNESCO and IAEA, London 1989; M. Abley, 'Time for Change', 1998; A. Smith, 'Another Article', 2000";
    const { items, websitesAccessedOn } = parseAPLItems(raw);
    expect(items).toHaveLength(3);
    expect(items[0].raw).toBe("M.F. Imber, The USA, ILO, UNESCO and IAEA, London 1989");
    expect(items[1].raw).toBe("M. Abley, 'Time for Change', 1998");
    expect(items[2].raw).toBe("A. Smith, 'Another Article', 2000");
    expect(websitesAccessedOn).toBeUndefined();
  });

  it("peels off '(all websites accessed ...)' footer", () => {
    const raw =
      "K. Gladdish, Governing from the Centre, London 1991; R. Ammerlaan (Ed.), Afscheid van Ruud Lubbers, 1989 (all websites accessed 12 September 2017).";
    const { items, websitesAccessedOn } = parseAPLItems(raw);
    expect(websitesAccessedOn).toBe("12 September 2017");
    expect(items).toHaveLength(2);
    expect(items[1].raw).toBe(
      "R. Ammerlaan (Ed.), Afscheid van Ruud Lubbers, 1989",
    );
  });

  it("returns empty list for empty input", () => {
    const { items } = parseAPLItems("");
    expect(items).toEqual([]);
  });

  it("filters out empty entries between semicolons", () => {
    const { items } = parseAPLItems("A, 1990;  ; B, 1995;");
    expect(items.map((i) => i.raw)).toEqual(["A, 1990", "B, 1995"]);
  });
});
