# bios-processed CHANGELOG

Every cosmetic edit applied to `src/content/bios-source/` to produce `src/content/bios-processed/`. Generated automatically by `npm run bios:diff`.

Files modified: **12**.

> Note: `Saouma-E 2013` is transformed but has no auto-generated diff below — its
> source is a legacy `.doc`, which the `bios:diff` track-changes generator cannot
> unzip (pre-existing tooling limitation, tracked separately), so 11 sections
> are listed for the 12 transforms.

## `Lubbers-R 2026.docx`

See [Lubbers-R 2026.diff.md](./Lubbers-R 2026.diff.md).

1. The parser recognises "(known as X)" or "(née X)" as an aside; a bare "(Ruud)" makes the name regex fail.

   - Before: `Rudolphus Franciscus Marie (Ruud), Dutch politician`
   - After:  `Rudolphus Franciscus Marie (known as Ruud), Dutch politician`

## `Holtrop-MW 2021.docx`

See [Holtrop-MW 2021.diff.md](./Holtrop-MW 2021.diff.md).

1. The parser recognises "(known as X)" or "(née X)" as an aside; "(for close colleagues: Bob)" doesn't match either pattern, so the name regex fails.

   - Before: `Marius Wilhelm (for close colleagues: Bob), Dutch central banker`
   - After:  `Marius Wilhelm (known as Bob), Dutch central banker`

## `Clausen-AW 2015.docx`

See [Clausen-AW 2015.diff.md](./Clausen-AW 2015.diff.md).

1. Three things in one edit: (a) "(called Tom)" → "(known as Tom)" so the name aside matches the parser pattern; (b) insert "American banker," to give the nationality detector a demonym; (c) split the two presidencies into separate role chunks — Bank of America (BofA) 1970-1981 and IBRD 1981-1986 — and drop the "and World Bank Group" qualifier on the IGO role so the IBRD abbreviation gets captured. The BofA dates are from public record; flagging here for the author to confirm.

   - Before: `Alden Winship (called Tom), Bank of America President and sixth President of the International Bank for Reconstruction and Development (IBRD…`
   - After:  `Alden Winship (known as Tom), American banker, President of Bank of America (BofA) 1970-1981 and sixth President of the International Bank f…`

## `Bonnet-H 2024.docx`

See [Bonnet-H 2024.diff.md](./Bonnet-H 2024.diff.md).

1. The parser expects "was born ..." immediately after the role/dates in the intro paragraph. The original intro starts the post-role sentence with "was the son of ...". Swap the two clauses so "was born ..." comes first; family info follows.

   - Before: `1931-1940, was the son of Jules Theobald Bonnet, collector of indirect taxes, and Marie Thérèse Lascoux. He was born 26 May 1888 in Châteaup…`
   - After:  `1931-1940, was born 26 May 1888 in Châteauponsac and passed away 25 October 1978 in Paris, France. He was the son of Jules Theobald Bonnet, …`

## `Black-ER 2014.docx`

See [Black-ER 2014.diff.md](./Black-ER 2014.diff.md).

1. No nationality demonym in the original intro, so the country/nationality detector found nothing. Insert "American banker and " before the role to give the parser a recognised demonym and a profession.

   - Before: `BLACK, Eugene Robert, third President`
   - After:  `BLACK, Eugene Robert, American banker and third President`

## `Orr-JB 2021.docx`

See [Orr-JB 2021.diff.md](./Orr-JB 2021.diff.md).

1. No nationality demonym at the start of the description (born in Scotland, UK). Insert "British " before the occupation.

   - Before: `ORR, John Boyd, nutritional scientist`
   - After:  `ORR, John Boyd, British nutritional scientist`

## `Pastizzi-D 2024.docx`

See [Pastizzi-D 2024.diff.md](./Pastizzi-D 2024.diff.md).

1. No nationality demonym (born in Zagreb, Yugoslavia — now Croatia). Insert "Croatian " before the occupation.

   - Before: `Pastizzi-Ferenčić), economist`
   - After:  `Pastizzi-Ferenčić), Croatian economist`

## `Wyndham White-E 2012.docx`

See [Wyndham White-E 2012.diff.md](./Wyndham White-E 2012.diff.md).

1. Years were inside parens before the shared organisation, so each role lost its org/abbreviation. Repeat "of the General Agreement on Tariffs and Trade (GATT)" for each role and move the year spans to the standard trailing position.

   - Before: `British civil servant and first Executive Secretary (1948-1965) and Director-General (1965-1968) of the General Agreement on Tariffs and Tra…`
   - After:  `British civil servant, first Executive Secretary of the General Agreement on Tariffs and Trade (GATT) 1948-1965 and Director-General of the …`

## `Phelan-EJ 2016.docx`

See [Phelan-EJ 2016.diff.md](./Phelan-EJ 2016.diff.md).

1. Second role was written without "of <ORG>", so the parser captured its title but lost the organisation/abbreviation. Repeat "of the International Labour Organization (ILO)" before the year span for the second role.

   - Before: `1941-1946 (acting) and Director-General 1941-1948 (retroactive appointment in 1946)`
   - After:  `1941-1946 (acting) and Director-General of the International Labour Organization (ILO) 1941-1948 (retroactive appointment in 1946)`

## `Robinson-MTW 2014.docx`

See [Robinson-MTW 2014.diff.md](./Robinson-MTW 2014.diff.md).

1. No nationality demonym in the original intro. Insert "Irish politician and " so the detector matches Irish/Ireland. (The OHCHR institution abbreviation for the second role is now back-filled globally by the parser's role-title alias table, so no docx edit is needed for that.)

   - Before: `(née Bourke), seventh President of Ireland`
   - After:  `(née Bourke), Irish politician and seventh President of Ireland`

## `Rey-F 2025.docx`

See [Rey-F 2025.diff.md](./Rey-F 2025.diff.md).

1. The connector ", then" between two roles caused the second role's chunk to start with "then ", which the parser kept as part of the title. Use " and " instead, which the parser already strips when it leads a chunk.

   - Before: `(ECD) 1911-1913, then Secretary-General`
   - After:  `(ECD) 1911-1913 and Secretary-General`
