# Parsing — Known Issues / Manual Review List

This file tracks docx-extraction quirks the parsers don't (yet) handle perfectly. Each item lists the affected entries so a human can eyeball them in the browser and decide if anything needs to be fixed in the docx, the parser, or the rendering.

Audit date: 2026-05-17 (Phase 2 of the parser refactor).

---

## 1. Archives written as prose, not as a `;`-separated list

The Author Instructions describe Archives as a semicolon-separated list of archive locations, but many bios are written as a prose paragraph (sometimes with intra-sentence semicolons). The parser splits on `; ` and the entry page renders multi-item sections as a `<ul>` — so prose entries appear as bullet points that don't make sense.

**Current rule:** 1 item ⇒ `<p>`, 2+ items ⇒ `<ul>`. Entries below have 2+ items but average item length > 150 chars, which strongly suggests prose rather than list.

Entries to review:

- `meyer-ei-2015` — 3 items, avg 326 chars
- `crowdy-re-2014` — 3 items, avg 255 chars
- `chisholm-b-2014` — 2 items, avg 251 chars
- `salim-sa-2016` — 2 items, avg 246 chars
- `davies-da-2016` — 3 items, avg 203 chars
- `cole-ws-2014` — 3 items, avg 180 chars
- `bonnet-h-2024-modified` — 2 items, avg 173 chars
- `rooth-i-2025` — 2 items, avg 172 chars
- `luns-jamh-2015` — 2 items, avg 169 chars
- `boutros-ghali-2019` — 2 items, avg 168 chars
- `clausen-aw-2015-modified` — 3 items, avg 165 chars ← the one originally reported
- `van-lennep-e-2017` — 2 items, avg 157 chars
- `myrdal-g-2014` — 2 items, avg 151 chars
- `vieira-de-mello-s-2017` — 2 items, avg 150 chars

**Possible mitigations:**
- Edit the docx to either (a) write a coherent prose paragraph without internal `;`, or (b) restructure as actual `;`-separated archive locations.
- Or extend the parser to detect prose (e.g. avg item length > 150 chars ⇒ render as `<p>` rather than `<ul>`).

---

## 2. `Holtrop-MW 2021.docx` — name not parseable

Build emits: `[docx] Holtrop-MW 2021.docx: 1 parser error(s): name_unparsed: Could not extract LASTNAME, Firstname from intro`.

The intro paragraph doesn't match the expected `LASTNAME, Firstname, ...` opener. Need to look at the docx and either fix the format or extend `parseIntro` to handle the variant.

Effect: `firstName` and `lastName` are empty strings, which propagates to the listing and entry page.

---

## 3. Multi-role entries with unusual formatting

Phase 2's role parser handles standard `<ordinal> <title> of <org> (<ABBR>) <years>` cleanly. The following entries have non-standard summary text and may need a human eye:

- `wyndham-white-e-2012` — years are inside parens *before* the org: `Executive Secretary (1948-1965) and Director-General (1965-1968) of GATT`. Parses into two roles ("Executive Secretary", "Director-General") but the org/abbr is shared and ends up on neither role.
- `phelan-ej-2016` — Second role is `(acting) and Director-General`-style; parses to title "Director-General" but the parenthetical `(acting)` annotation is lost.
- `holtrop-mw-2021` — title `President and Chairman` is captured as a single role but is really two combined.
- `kotaite-aa-2025`, `rey-f-2025`, `idris-ke-2016` — multi-role; verify each role's org/years look right.

---

## 4. Nationality not detected

Five entries have no `nationality` extracted because the summary opener doesn't include a recognised English demonym for a current UN-member state:

- `black-er-2014` — no nationality word at all in summary (`"third President of the IBRD..."`).
- `chan-m-2021` — `"Hong Kong medical officer..."`. "Hong Kong" isn't a UN-member demonym.
- `eichhoff-jj-2024` — no nationality word; summary starts with role.
- `orr-jb-2021` — `"nutritional scientist and..."`; nationality missing from the docx.
- `pastizzi-d-2024` — `"economist and..."`; same.

**Mitigations:** fix the docx to include the demonym (e.g. "American economist") or extend the nationality detector to recognise sub-national identifiers.

---

## 5. URLs with embedded `;` (fixed; logged for posterity)

`Carrington-PAR 2016.docx` had a URL like `http://archives.nato.int/;search?query=Carrington`. RFC 3986 permits `;` in URL paths, but the parser used to split on it, fragmenting one citation into two. Fixed in Phase 2 by tightening the split to `;` followed by whitespace.

If new bios surface URL-split issues, double-check the affected docx for valid URLs containing semicolons.

---

## How to verify

```bash
npm run build                        # surfaces parser errors in the console
python3 -c "..."                     # ad-hoc data inspection of dist/index.html astro-island props
open dist/entries/<slug>/index.html  # eyeball the rendered entry page
```

When a docx is edited or a parser fix lands, rerun `npm run build` and remove the corresponding entry from this list.
