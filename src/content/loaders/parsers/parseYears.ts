import type { ParserResult, Warning } from "./types";

const YEARS_RE = /(\d{4})-(\d{4})/;

export type YearsFields = {
  startYear: number | null;
  endYear: number | null;
};

/**
 * Extract the first NNNN-NNNN year span found in text.
 */
export function parseYears(text: string): ParserResult<YearsFields> {
  const warnings: Warning[] = [];
  const value: YearsFields = { startYear: null, endYear: null };

  if (!text) {
    warnings.push({
      code: "years_missing_input",
      field: "years",
      message: "No text provided",
      severity: "warn",
    });
    return { value, warnings };
  }

  const match = text.match(YEARS_RE);
  if (!match) {
    warnings.push({
      code: "years_unparsed",
      field: "years",
      message: "Could not find NNNN-NNNN year span in text",
      severity: "warn",
    });
    return { value, warnings };
  }
  value.startYear = Number(match[1]);
  value.endYear = Number(match[2]);
  return { value, warnings };
}
