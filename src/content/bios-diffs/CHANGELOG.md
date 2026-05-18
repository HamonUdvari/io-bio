# bios-processed CHANGELOG

Every cosmetic edit applied to `src/content/bios-source/` to produce `src/content/bios-processed/`. Generated automatically by `npm run bios:diff`.

Files modified: **12**.

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

1. The parser recognises "(known as X)" or "(née X)" as an aside; "(called Tom)" doesn't match either pattern, so the name regex fails.

   - Before: `Alden Winship (called Tom), Bank of America President`
   - After:  `Alden Winship (known as Tom), Bank of America President`

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

## `Chan-M 2021.docx`

See [Chan-M 2021.diff.md](./Chan-M 2021.diff.md).

1. "Hong Kong" is not a UN-member demonym in world-countries, so the nationality detector skipped this entry. Adding "Chinese" preserves the Hong Kong identifier while giving the parser a matchable demonym.

   - Before: `Hong Kong medical officer`
   - After:  `Hong Kong Chinese medical officer`

## `Eichhoff-JJ 2024.docx`

See [Eichhoff-JJ 2024.diff.md](./Eichhoff-JJ 2024.diff.md).

1. No nationality in the original intro (born in Bonn, Electorate of Cologne — now Germany). Insert "German civil servant and " before the role so the demonym is detected.

   - Before: `EICHHOFF, Johann Joseph, Director-General`
   - After:  `EICHHOFF, Johann Joseph, German civil servant and Director-General`

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

## `Rey-F 2025.docx`

See [Rey-F 2025.diff.md](./Rey-F 2025.diff.md).

1. The connector ", then" between two roles caused the second role's chunk to start with "then ", which the parser kept as part of the title. Use " and " instead, which the parser already strips when it leads a chunk.

   - Before: `(ECD) 1911-1913, then Secretary-General`
   - After:  `(ECD) 1911-1913 and Secretary-General`
