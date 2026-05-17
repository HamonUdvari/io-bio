import type { ParserResult, Role, Warning } from "./types";

const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "former",
];

const ORDINAL_RE = new RegExp(`\\b(${ORDINALS.join("|")})\\b`, "gi");

/**
 * Matches a year-end token that ends a role description. Captures:
 *   - "NNNN-NNNN"         -> groups 1 / 2
 *   - "in NNNN"           -> group 3 (used as both start and end)
 *   - "Month-Month NNNN"  -> group 4 (used as both start and end)
 *   - standalone "NNNN"   -> group 5 (used as both start and end)
 *
 * Year ranges are matched anywhere; single years and "in YYYY" require a
 * following role separator or end-of-text so we don't grab arbitrary years
 * from prose.
 */
const ROLE_END_RE =
  /(?:(\d{4})\s*[-–]\s*(\d{4})|(?:in\s+(\d{4})|[A-Z][a-z]+\s*[-–]\s*[A-Z][a-z]+\s+(\d{4})|(\d{4}))(?=\s+and\s+|,\s+|\s*$))/g;

/**
 * Phase 2: extract every role described in the role-summary text.
 *
 * Strategy:
 *  1. Find each year span (NNNN-NNNN) in the text — each one marks the END
 *     of one role.
 *  2. The chunk for that role is the text since the previous role's year
 *     span (or the start of input).
 *  3. Within each chunk, find the LAST ordinal word (first, second, ...).
 *     That introduces the role; everything after it and before " of " is
 *     the title. Title is left as-is, so mixed-case titles like
 *     "United Nations High Commissioner for Refugees" parse correctly.
 *  4. After " of [the]? " is the organisation, optionally with a
 *     parenthesised abbreviation, ending at the year span.
 *
 * If a chunk has no year span at the end (e.g. open-ended role), it is
 * skipped (matches conservative legacy behaviour).
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

  const yearMatches = [...text.matchAll(ROLE_END_RE)];
  if (yearMatches.length === 0) {
    warnings.push({
      code: "roles_no_year_span",
      field: "roles",
      message: "No year spans found; cannot delimit roles",
      severity: "warn",
    });
    return { value: [], warnings };
  }

  const roles: Role[] = [];
  let chunkStart = 0;

  for (const yearMatch of yearMatches) {
    const yearEnd = (yearMatch.index ?? 0) + yearMatch[0].length;
    const chunk = text.substring(chunkStart, yearEnd);

    const role = parseRoleChunk(chunk, warnings);
    if (role) {
      const startYear =
        yearMatch[1] ?? yearMatch[3] ?? yearMatch[4] ?? yearMatch[5];
      const endYear = yearMatch[2] ?? startYear;
      role.startYear = Number(startYear);
      role.endYear = Number(endYear);
      roles.push(role);
    }

    chunkStart = yearEnd;
    // Skip an inter-role connector ("and", ",") to start the next chunk
    const sepMatch = text.substring(chunkStart).match(/^\s*(?:and|,|;)\s+/i);
    if (sepMatch) chunkStart += sepMatch[0].length;
  }

  if (roles.length === 0) {
    warnings.push({
      code: "role_unparsed",
      field: "role",
      message: "Year spans found but no role chunks parsed",
      severity: "warn",
    });
  }

  return { value: roles, warnings };
}

function parseRoleChunk(chunk: string, _warnings: Warning[]): Role | null {
  // Strip the trailing year description (allowing optional surrounding
  // parens, e.g. "Director-General (1965-1968)").
  let workingText = chunk
    .replace(
      /\s*\(?\s*(?:\d{4}\s*[-–]\s*\d{4}|in\s+\d{4}|[A-Z][a-z]+\s*[-–]\s*[A-Z][a-z]+\s+\d{4}|\d{4})\s*\)?\s*$/,
      "",
    )
    .trim();
  // Strip stray leading punctuation that arises when chunks straddle
  // parenthesised year ranges (Wyndham-White) or parenthetical asides
  // ("(acting)") between roles. Don't touch trailing parens — they may be the
  // role's own (ABBR). Also strip a leading "and "/"or " connector.
  workingText = workingText
    .replace(/^[\s,;()]+/, "")
    .replace(/^(?:and|or)\s+/i, "")
    .trim();

  // Find last ordinal in the chunk — that introduces the role.
  const ordinalMatches = [...workingText.matchAll(ORDINAL_RE)];
  let ordinalText: string | undefined;

  if (ordinalMatches.length > 0) {
    const last = ordinalMatches[ordinalMatches.length - 1];
    ordinalText = last[1].toLowerCase();
    workingText = workingText
      .substring((last.index ?? 0) + last[0].length)
      .trimStart();
  } else {
    // No ordinal — skip a "<nationality> <occupation> and " or
    // "<...>, " preamble by jumping past the last " and "/", " that occurs
    // before " of " (or anywhere if there is no " of ").
    const ofIdx = workingText.search(/\s+of\s+/);
    const head = ofIdx >= 0 ? workingText.substring(0, ofIdx) : workingText;
    const sepMatch = head.match(/^.*(?:\s+and\s+|,\s+)/);
    if (sepMatch) {
      workingText = workingText.substring(sepMatch[0].length).trimStart();
    }
  }

  let title: string;
  let organisation: string | undefined;
  let abbreviation: string | undefined;

  const ofMatch = workingText.match(/\s+of\s+(?:the\s+)?/);
  if (ofMatch) {
    title = workingText.substring(0, ofMatch.index ?? 0).trim();
    let after = workingText
      .substring((ofMatch.index ?? 0) + ofMatch[0].length)
      .trim();

    const abbrMatch = after.match(/\s*\(([A-Z][A-Za-z]*)\)\s*$/);
    if (abbrMatch) {
      abbreviation = abbrMatch[1];
      after = after.substring(0, abbrMatch.index ?? 0).trim();
    }
    organisation = after || undefined;
  } else {
    // No " of " separator — pattern is "<title> (ABBR)?".
    const abbrMatch = workingText.match(/\s*\(([A-Z][A-Za-z]*)\)\s*$/);
    if (abbrMatch) {
      abbreviation = abbrMatch[1];
      title = workingText.substring(0, abbrMatch.index ?? 0).trim();
    } else {
      title = workingText.trim();
    }
  }

  if (!title) return null;

  return { title, ordinalText, organisation, abbreviation };
}
