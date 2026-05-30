/**
 * Parenthetical alias shown after a person's name. The two source aliases are
 * kept as separate fields and rendered differently:
 *   knownAs "Ruud"  → " (Ruud)"        — a nickname, shown bare
 *   nee "Bourke"    → " (née Bourke)"  — a maiden name, keeps the "née" marker
 * Returns "" when neither is set. Includes a leading space so it can be
 * appended directly after the name. (If both are somehow set, knownAs wins.)
 */
export function aliasSuffix(knownAs?: string, nee?: string): string {
  if (knownAs) return ` (${knownAs})`;
  if (nee) return ` (née ${nee})`;
  return "";
}
