import { toHtml } from "hast-util-to-html";
import { isEmptyHastNode, nodesToHtml, transformNode } from "./astUtils";
import { parseAPL } from "./parseAPL";
import { parseCitation } from "./parseCitation";
import { parseImage } from "./parseImage";
import { parseIntro } from "./parseIntro";
import { parseNationality } from "./parseNationality";
import { parseOrg } from "./parseOrg";
import { parseRoles } from "./parseRoles";
import { parseVersion } from "./parseVersion";
import { parseYears } from "./parseYears";
import type { ExtractedBio, ParserResult, Warning } from "./types";

/**
 * Run every parser against an officeparser AST and assemble a single
 * `ExtractedBio` plus the union of warnings.
 *
 * The image attachment is returned as base64 + filename; writing it to disk
 * is the caller's responsibility (Node side only).
 */
export function extractAll(ast: any): ParserResult<ExtractedBio> {
  const warnings: Warning[] = [];
  const content: any[] = ast?.content || [];

  const extractedIndices = new Set<number>();

  const image = parseImage(ast);
  warnings.push(...image.warnings);
  image.value.consumed.forEach((i) => extractedIndices.add(i));

  const introNode = content[0];
  if (introNode) extractedIndices.add(0);
  const introText: string = introNode?.text ?? "";

  const intro = parseIntro(introText);
  warnings.push(...intro.warnings);

  const summary = intro.value.summary ?? "";

  const roles = parseRoles(summary);
  warnings.push(...roles.warnings);

  const years = parseYears(summary);
  warnings.push(...years.warnings);

  const org = parseOrg(summary);
  warnings.push(...org.warnings);

  const nationality = parseNationality(summary);
  warnings.push(...nationality.warnings);

  // Fold years into the primary role for the roles[] view.
  if (roles.value[0]) {
    if (years.value.startYear != null)
      roles.value[0].startYear = years.value.startYear;
    if (years.value.endYear != null)
      roles.value[0].endYear = years.value.endYear;
  }

  const version = parseVersion(content);
  warnings.push(...version.warnings);
  version.value.consumed.forEach((i) => extractedIndices.add(i));

  const citation = parseCitation(content);
  warnings.push(...citation.warnings);
  citation.value.consumed.forEach((i) => extractedIndices.add(i));

  const apl = parseAPL(content);
  warnings.push(...apl.warnings);
  apl.value.consumed.forEach((i) => extractedIndices.add(i));

  // Body = everything that wasn't claimed by another parser.
  const remaining = content.filter((_, i) => !extractedIndices.has(i));
  const bodyHast = remaining
    .map(transformNode)
    .filter((n) => !isEmptyHastNode(n));
  const body = toHtml(bodyHast as any);

  const html = nodesToHtml(content);

  const primary = roles.value[0];

  const value: ExtractedBio = {
    firstName: intro.value.firstName,
    lastName: intro.value.lastName,
    knownAs: intro.value.knownAs,
    summary: intro.value.summary,
    life: intro.value.life,
    roles: roles.value,
    imageSource: image.value.imageSource,
    imageAttachment: image.value.attachment,
    version: version.value.version,
    authors: citation.value.authors,
    organisation: org.value.organisation,
    role: primary?.title ?? null,
    nationality: nationality.value.nationality,
    country: nationality.value.country,
    startYear: years.value.startYear,
    endYear: years.value.endYear,
    archives: apl.value.archives,
    publications: apl.value.publications,
    literature: apl.value.literature,
    body,
    html,
  };

  return { value, warnings };
}
