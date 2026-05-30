/**
 * Parenthetical "known as" nickname shown after a person's name, e.g.
 * "VAN LENNEP Emile" known as "Bob" → " (Bob)". Pass the person's name so a
 * redundant alias is suppressed.
 *
 * Returns "" when:
 *  - there is no knownAs, or
 *  - the knownAs already appears in the name (e.g. name "Charles Louis", known
 *    as "Louis") — showing it reads as redundant. Matched case-insensitively as
 *    a whole word-sequence (space-delimited), so "Louis" ≠ "Louise".
 *
 * The "née" maiden name is intentionally NOT rendered after the name for now;
 * it is still parsed and kept on the entry (data.nee) for possible future use.
 *
 * Includes a leading space so it can be appended directly after the name.
 */
export function aliasSuffix(knownAs?: string, name?: string): string {
  const k = knownAs?.trim();
  if (!k) return "";
  const nameNorm = ` ${(name ?? "").toLowerCase().replace(/\s+/g, " ").trim()} `;
  const kNorm = ` ${k.toLowerCase().replace(/\s+/g, " ")} `;
  if (nameNorm.includes(kNorm)) return "";
  return ` (${k})`;
}
