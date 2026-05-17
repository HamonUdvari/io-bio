import type { ParserResult, Role, Warning } from "./types";

const ROLE_RE =
  /(?<=\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|and)\s+|,\s+)([A-Z][A-Za-z]*(?:[\s-](?:and|&|[A-Z][A-Za-z]*))*)\s+of\s+(?:the\s+)?(?:[A-Z]|Board)/g;

/**
 * Phase 1 behaviour: extract a single role title from the role-summary string.
 *
 * Matches the original loader: `roleMatch[roleMatch.length - 1]` (last match
 * wins), strips everything after " of ". Returns an array of length 0 or 1
 * so callers can already iterate; Phase 2 will extract multiple roles.
 *
 * Year extraction is done separately (see parseYears) so a failed role match
 * does not also lose the years.
 */
export function parseRoles(text: string): ParserResult<Role[]> {
  const warnings: Warning[] = [];
  if (!text) {
    warnings.push({
      code: "roles_missing_input",
      field: "roles",
      message: "No summary text provided",
      severity: "warn",
    });
    return { value: [], warnings };
  }

  const matches = text.match(ROLE_RE);
  if (!matches || matches.length === 0) {
    warnings.push({
      code: "role_unparsed",
      field: "role",
      message: "Role regex did not match in summary",
      severity: "warn",
    });
    return { value: [], warnings };
  }

  const lastRole = matches[matches.length - 1];
  const cleaned = lastRole.replace(/\s+of\s+.*$/, "").trim();

  const role: Role = { title: cleaned };

  if (matches.length > 1) {
    warnings.push({
      code: "role_multiple_truncated",
      field: "roles",
      message: `Summary contains ${matches.length} role matches but only the last is kept (legacy behavior)`,
      severity: "info",
    });
  }

  return { value: [role], warnings };
}
