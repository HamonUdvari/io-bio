import { nameCase } from "@foundernest/namecase";
import type { IntroFields, ParserResult, Warning } from "./types";

// The first name may be followed by a parenthetical nickname or maiden name in
// several forms — "(known as X)", "(called X)", "(née X)", or a bare "(X)" —
// captured whole as group 3 and classified below. Accepting a bare nickname
// matters: an unclassified "(Ruud)" would otherwise fail the entire name match,
// yielding an empty title that breaks Zenodo minting.
const NAME_RE = /^([^,]+),\s*([^(,]+?)\s*(?:\(([^)]*)\)\s*)?,/i;
const NEE_RE = /^n[eé]e\s+(.+)$/i;
const KNOWN_AS_RE = /^(?:known as|called)\s+(.+)$/i;
const SUMMARY_RE = /^[^,]+,\s*[^,]+,\s*(.+?)\s*,\s*was born/i;
const LIFE_RE = /(was.+)$/i;

export function parseIntro(introText: string): ParserResult<IntroFields> {
  const warnings: Warning[] = [];

  const value: IntroFields = {
    firstName: null,
    lastName: null,
    summary: null,
    life: null,
  };

  if (!introText || typeof introText !== "string") {
    warnings.push({
      code: "intro_missing",
      field: "intro",
      message: "Intro paragraph is empty or non-string",
      severity: "error",
    });
    return { value, warnings };
  }

  const nameMatch = introText.match(NAME_RE);
  if (nameMatch) {
    // Strip square brackets some source docs put around a name part
    // (e.g. "[van Heuven] Goedhart") so they don't show in the rendered name.
    value.lastName = nameCase(
      nameMatch[1].replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim(),
    );
    value.firstName = nameMatch[2].trim();
    const paren = nameMatch[3]?.trim();
    if (paren) {
      // Classify the parenthetical: "née X" → maiden name (nee);
      // "known as X" / "called X" → nickname (knownAs); a bare "(X)" → nickname.
      const nee = paren.match(NEE_RE);
      const knownAs = paren.match(KNOWN_AS_RE);
      if (nee) value.nee = nee[1].trim();
      else if (knownAs) value.knownAs = knownAs[1].trim();
      else value.knownAs = paren;
    }
  } else {
    warnings.push({
      code: "name_unparsed",
      field: "name",
      message: "Could not extract LASTNAME, Firstname from intro",
      severity: "error",
    });
  }

  const summaryMatch = introText.match(SUMMARY_RE);
  if (summaryMatch) {
    value.summary = summaryMatch[1].trim();
  } else {
    warnings.push({
      code: "summary_unparsed",
      field: "summary",
      message:
        "Could not extract summary (expected pattern: \"...., role, was born...\")",
      severity: "error",
    });
  }

  const lifeMatch = introText.match(LIFE_RE);
  if (lifeMatch) {
    let life = lifeMatch[1].trim();
    if (life.length > 1) life = life.charAt(0).toUpperCase() + life.slice(1);
    value.life = life;
  } else {
    warnings.push({
      code: "life_unparsed",
      field: "life",
      message: "Could not find life sentence starting with 'was '",
      severity: "warn",
    });
  }

  return { value, warnings };
}
