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

  const countryObject = countries.find((c: any) => {
    if (!c.unMember) return false;
    const f = c.demonyms?.eng?.f || "UNDEFINED";
    const m = c.demonyms?.eng?.m || "UNDEFINED";
    return text.includes(f) || text.includes(m);
  });

  if (!countryObject) {
    warnings.push({
      code: "nationality_unknown",
      field: "nationality",
      message: "Could not match a UN-member demonym in text",
      severity: "warn",
    });
    return { value, warnings };
  }

  value.country = (countryObject as any).name.common;
  const f = (countryObject as any).demonyms?.eng?.f || "UNDEFINED";
  const m = (countryObject as any).demonyms?.eng?.m || "UNDEFINED";
  if (text.includes(f)) value.nationality = f;
  if (text.includes(m)) value.nationality = m;

  return { value, warnings };
}
