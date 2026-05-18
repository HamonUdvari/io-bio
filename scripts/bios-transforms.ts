/**
 * Per-file cosmetic transformations applied to the docx files in
 * `src/content/bios-source/` to produce `src/content/bios-processed/`.
 *
 * Each entry lists one or more text replacements. Each replacement carries a
 * human-readable reason so it can show up in the diff sent back to the
 * author, explaining why the change was needed for the parser.
 *
 * Edits are applied verbatim against `word/document.xml`. If a `find` string
 * is split across multiple Word runs (e.g. mixed formatting), it won't match
 * and the script will report an error so we can adjust.
 */

export type TextReplace = {
  type: "replace";
  find: string;
  replace: string;
  reason: string;
};

export type FileTransform = {
  /** Exact filename in `bios-source/`. */
  source: string;
  changes: TextReplace[];
};

export const transforms: FileTransform[] = [
  {
    source: "Lubbers-R 2026.docx",
    changes: [
      {
        type: "replace",
        find: "Rudolphus Franciscus Marie (Ruud), Dutch politician",
        replace:
          "Rudolphus Franciscus Marie (known as Ruud), Dutch politician",
        reason:
          'The parser recognises "(known as X)" or "(née X)" as an aside; a bare "(Ruud)" makes the name regex fail.',
      },
    ],
  },
  {
    source: "Holtrop-MW 2021.docx",
    changes: [
      {
        type: "replace",
        find: "Marius Wilhelm (for close colleagues: Bob), Dutch central banker",
        replace: "Marius Wilhelm (known as Bob), Dutch central banker",
        reason:
          'The parser recognises "(known as X)" or "(née X)" as an aside; "(for close colleagues: Bob)" doesn\'t match either pattern, so the name regex fails.',
      },
    ],
  },
  {
    source: "Clausen-AW 2015.docx",
    changes: [
      {
        type: "replace",
        find: "Alden Winship (called Tom), Bank of America President",
        replace:
          "Alden Winship (known as Tom), Bank of America President",
        reason:
          'The parser recognises "(known as X)" or "(née X)" as an aside; "(called Tom)" doesn\'t match either pattern, so the name regex fails.',
      },
    ],
  },
  {
    source: "Bonnet-H 2024.docx",
    changes: [
      {
        type: "replace",
        find: "1931-1940, was the son of Jules Theobald Bonnet, collector of indirect taxes, and Marie Thérèse Lascoux. He was born 26 May 1888 in Châteauponsac and passed away 25 October 1978 in Paris, France.",
        replace:
          "1931-1940, was born 26 May 1888 in Châteauponsac and passed away 25 October 1978 in Paris, France. He was the son of Jules Theobald Bonnet, collector of indirect taxes, and Marie Thérèse Lascoux.",
        reason:
          'The parser expects "was born ..." immediately after the role/dates in the intro paragraph. The original intro starts the post-role sentence with "was the son of ...". Swap the two clauses so "was born ..." comes first; family info follows.',
      },
    ],
  },
  {
    source: "Black-ER 2014.docx",
    changes: [
      {
        type: "replace",
        find: "BLACK, Eugene Robert, third President",
        replace: "BLACK, Eugene Robert, American banker and third President",
        reason:
          'No nationality demonym in the original intro, so the country/nationality detector found nothing. Insert "American banker and " before the role to give the parser a recognised demonym and a profession.',
      },
    ],
  },
  {
    source: "Chan-M 2021.docx",
    changes: [
      {
        type: "replace",
        find: "Hong Kong medical officer",
        replace: "Hong Kong Chinese medical officer",
        reason:
          '"Hong Kong" is not a UN-member demonym in world-countries, so the nationality detector skipped this entry. Adding "Chinese" preserves the Hong Kong identifier while giving the parser a matchable demonym.',
      },
    ],
  },
  {
    source: "Eichhoff-JJ 2024.docx",
    changes: [
      {
        type: "replace",
        find: "EICHHOFF, Johann Joseph, Director-General",
        replace:
          "EICHHOFF, Johann Joseph, German civil servant and Director-General",
        reason:
          'No nationality in the original intro (born in Bonn, Electorate of Cologne — now Germany). Insert "German civil servant and " before the role so the demonym is detected.',
      },
    ],
  },
  {
    source: "Orr-JB 2021.docx",
    changes: [
      {
        type: "replace",
        find: "ORR, John Boyd, nutritional scientist",
        replace: "ORR, John Boyd, British nutritional scientist",
        reason:
          'No nationality demonym at the start of the description (born in Scotland, UK). Insert "British " before the occupation.',
      },
    ],
  },
  {
    source: "Pastizzi-D 2024.docx",
    changes: [
      {
        type: "replace",
        find: "Pastizzi-Ferenčić), economist",
        replace: "Pastizzi-Ferenčić), Croatian economist",
        reason:
          'No nationality demonym (born in Zagreb, Yugoslavia — now Croatia). Insert "Croatian " before the occupation.',
      },
    ],
  },
  {
    source: "Wyndham White-E 2012.docx",
    changes: [
      {
        type: "replace",
        find: "British civil servant and first Executive Secretary (1948-1965) and Director-General (1965-1968) of the General Agreement on Tariffs and Trade (GATT)",
        replace:
          "British civil servant, first Executive Secretary of the General Agreement on Tariffs and Trade (GATT) 1948-1965 and Director-General of the General Agreement on Tariffs and Trade (GATT) 1965-1968",
        reason:
          "Years were inside parens before the shared organisation, so each role lost its org/abbreviation. Repeat \"of the General Agreement on Tariffs and Trade (GATT)\" for each role and move the year spans to the standard trailing position.",
      },
    ],
  },
  {
    source: "Phelan-EJ 2016.docx",
    changes: [
      {
        type: "replace",
        find: "1941-1946 (acting) and Director-General 1941-1948 (retroactive appointment in 1946)",
        replace:
          "1941-1946 (acting) and Director-General of the International Labour Organization (ILO) 1941-1948 (retroactive appointment in 1946)",
        reason:
          'Second role was written without "of <ORG>", so the parser captured its title but lost the organisation/abbreviation. Repeat "of the International Labour Organization (ILO)" before the year span for the second role.',
      },
    ],
  },
  {
    source: "Rey-F 2025.docx",
    changes: [
      {
        type: "replace",
        find: "(ECD) 1911-1913, then Secretary-General",
        replace: "(ECD) 1911-1913 and Secretary-General",
        reason:
          'The connector ", then" between two roles caused the second role\'s chunk to start with "then ", which the parser kept as part of the title. Use " and " instead, which the parser already strips when it leads a chunk.',
      },
    ],
  },
];
