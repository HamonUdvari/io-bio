import internationalOrganisations from "../ios.json";
import type { ParserResult, Warning } from "./types";

export type OrgFields = {
  /** The string used downstream as `organisation` — abbreviation if present, otherwise the full name from ios.json, otherwise null. */
  organisation: string | null;
};

const PAREN_RE = /\(([^)]+)\)/;

/**
 * Extract the organisation token from a role-summary string.
 * Mirrors the original loader logic:
 *   1. If text contains a parenthesised token, use that. e.g. "...(UN)..." -> "UN"
 *   2. Otherwise, find the first ios.json entry whose `name` appears verbatim in text, and use its `abbreviation` (or `name` if no abbreviation).
 */
export function parseOrg(text: string): ParserResult<OrgFields> {
  const warnings: Warning[] = [];
  const value: OrgFields = { organisation: null };

  if (!text) {
    warnings.push({
      code: "org_missing_input",
      field: "organisation",
      message: "No text provided",
      severity: "warn",
    });
    return { value, warnings };
  }

  const parenMatch = text.match(PAREN_RE);
  if (parenMatch) {
    value.organisation = parenMatch[1].trim();
    return { value, warnings };
  }

  const io = internationalOrganisations.find((entry) =>
    text.includes(entry.name),
  );
  if (io) {
    value.organisation = io.abbreviation || io.name;
  } else {
    warnings.push({
      code: "org_unknown",
      field: "organisation",
      message: "Could not identify organisation in text",
      severity: "warn",
    });
  }

  return { value, warnings };
}
