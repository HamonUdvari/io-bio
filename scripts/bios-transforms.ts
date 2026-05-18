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
];
