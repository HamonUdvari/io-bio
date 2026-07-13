import { toHtml } from "hast-util-to-html";
import { isEmptyHastNode, nodesToHtml, transformNode } from "./astUtils";
import { parseAPL } from "./parseAPL";
import { parseCitation } from "./parseCitation";
import { parseImage } from "./parseImage";
import { parseIntro } from "./parseIntro";
import { parseNationality } from "./parseNationality";
import { parseRoles } from "./parseRoles";
import { parseVersion } from "./parseVersion";
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

  // The intro block can extend past para 0: authors follow the vitals paragraph
  // with an optional short identity/title note (name spelling, a name change, an
  // ennoblement, a pseudonym…), then a blank line before the biography narrative.
  // Claim that whole leading run of non-empty paragraphs for the header so the
  // note renders with the vitals instead of leaking in as the biography's first
  // paragraph. The blank line (first empty paragraph) is the intended boundary
  // — present in every source doc; any non-paragraph node also ends the run.
  const introNotes: string[] = [];
  if (introNode) {
    for (let i = 1; i < content.length; i++) {
      const node = content[i];
      const text = (node?.text ?? "").trim();
      if (node?.type !== "paragraph" || text === "") break;
      introNotes.push(text);
      extractedIndices.add(i);
    }
  }

  const intro = parseIntro(introText);
  warnings.push(...intro.warnings);

  const summary = intro.value.summary ?? "";

  const roles = parseRoles(summary);
  warnings.push(...roles.warnings);

  const nationality = parseNationality(summary);
  warnings.push(...nationality.warnings);

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

  const value: ExtractedBio = {
    firstName: intro.value.firstName,
    lastName: intro.value.lastName,
    knownAs: intro.value.knownAs,
    nee: intro.value.nee,
    summary: intro.value.summary,
    life: intro.value.life,
    introNotes,
    roles: roles.value,
    nationality: nationality.value.nationality,
    country: nationality.value.country,
    imageSource: image.value.imageSource,
    imageAttachment: image.value.attachment,
    version: version.value.version,
    authors: citation.value.authors,
    archives: apl.value.archives,
    publications: apl.value.publications,
    literature: apl.value.literature,
    body,
    html,
  };

  return { value, warnings };
}
