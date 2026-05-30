import countries from "world-countries/countries.json";
import type { ParserResult, Warning } from "./types";

export type NationalityFields = {
  country: string | null;
  nationality: string | null;
};

/**
 * Extract { country, nationality } from a text snippet by matching English
 * demonyms against world-countries. Only UN member states are considered, to
 * avoid spurious matches on historical/dependent entities.
 *
 * Mirrors the original loader: prefers the male demonym when both match.
 */
export function parseNationality(text: string): ParserResult<NationalityFields> {
  const warnings: Warning[] = [];
  const value: NationalityFields = { country: null, nationality: null };

  if (!text) {
    warnings.push({
      code: "nationality_missing_input",
      field: "nationality",
      message: "No text provided",
      severity: "warn",
    });
    return { value, warnings };
  }

  // Pick the UN-member demonym that appears EARLIEST in the text (the leading
  // demonym is the stated nationality), preferring the longest match on a tie.
  // Selecting by earliest position — rather than first-in-data-order, the old
  // bug — fixes substring collisions where a demonym is contained in a LATER
  // word: e.g. "German" inside "…Refugees Coming from Germany" no longer beats
  // the leading "American", because "American" occurs earlier (issue #10). On an
  // equal-position tie the longer demonym wins, so a demonym that is a prefix of
  // a longer one at the same offset resolves to the more specific match
  // (defensive — no such prefix collision exists among world-countries' current
  // UN-member demonyms).
  let best: { country: any; demonym: string; index: number } | null = null;
  for (const c of countries as any[]) {
    if (!c.unMember) continue;
    for (const dem of [c.demonyms?.eng?.f, c.demonyms?.eng?.m]) {
      if (!dem) continue;
      const index = text.indexOf(dem);
      if (index < 0) continue;
      if (
        !best ||
        index < best.index ||
        (index === best.index && dem.length > best.demonym.length)
      ) {
        best = { country: c, demonym: dem, index };
      }
    }
  }

  if (!best) {
    warnings.push({
      code: "nationality_unknown",
      field: "nationality",
      message: "Could not match a UN-member demonym in text",
      severity: "warn",
    });
    return { value, warnings };
  }

  value.country = best.country.name.common;
  value.nationality = best.demonym;

  return { value, warnings };
}
