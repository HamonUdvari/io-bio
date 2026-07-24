import { nameCase } from "@foundernest/namecase";
import type { IntroFields, ParserResult, Warning } from "./types";

// Group 3 captures the qualifier ("known as" | "née" | "called"); group 4 the
// alias name. "called" is a nickname form (e.g. "Alden Winship (called Tom)")
// and is treated like "known as" — without it the name fails to parse, leaving
// an empty title that later breaks Zenodo minting.
const NAME_RE = /^([^,]+),\s*([^(,]+)(?:\s*\((known as|née|called)\s+(.+?)\))?,/i;
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
    if (nameMatch[4]) {
      const alias = nameMatch[4].trim();
      // Two distinct fields, chosen by the source qualifier (group 3):
      // "known as" → a nickname (knownAs); "née" → a maiden name (nee).
      if (/née/i.test(nameMatch[3])) value.nee = alias;
      else value.knownAs = alias;
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
