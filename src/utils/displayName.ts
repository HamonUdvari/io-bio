/**
 * Parenthetical alias shown after a person's name, e.g. "VAN LENNEP Emile"
 * known as "Bob" → " (Bob)", or "BRUNDTLAND Gro" née "Harlem" → " (née Harlem)".
 * Pass the person's name so a redundant alias is suppressed.
 *
 * Precedence — a "known as" nickname wins when present; otherwise the "née"
 * maiden name renders as "(née X)". So when an entry has both, only the
 * known-as shows and the née is omitted (the corpus standard).
 *
 * Returns "" when neither applies, or when the chosen alias already appears in
 * the name (e.g. name "Charles Louis", known as "Louis") — matched
 * case-insensitively as a whole space-delimited word-sequence, so "Louis" ≠
 * "Louise".
 *
 * Includes a leading space so it can be appended directly after the name.
 */
export function aliasSuffix(
  knownAs?: string,
  name?: string,
  nee?: string,
): string {
  const nameNorm = ` ${(name ?? "").toLowerCase().replace(/\s+/g, " ").trim()} `;
  const isRedundant = (alias: string) =>
    nameNorm.includes(` ${alias.toLowerCase().replace(/\s+/g, " ")} `);

  // Known-as takes precedence: when present it fills the parenthetical and the
  // née is omitted (still suppressed if it just repeats the name).
  const k = knownAs?.trim();
  if (k) return isRedundant(k) ? "" : ` (${k})`;

  const n = nee?.trim();
  if (n) return isRedundant(n) ? "" : ` (née ${n})`;

  return "";
}
