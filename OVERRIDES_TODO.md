# Image overrides — TODO checklist

Last update: 2026-05-18. This file is regenerable; the source of truth is `src/content/bios-images/` (applied), `src/content/bios-images-pending/manual-fetch.csv` (pending), and `/tmp/img-fetch/agent-results.tsv` (investigation log).

## Snapshot

| Bucket | Count |
|---|---|
| ✅ Override applied | 40 |
| 📋 Pending manual fetch | 14 |
| 🟡 Investigated, no same-image upgrade possible | 42 |
| 🔓 Remaining low-res (<640px), not yet touched | 0 |
| ⚪ Open but already ≥640px (no action) | 11 |
| **Total unique entries** | **107** |

## Status flow

```
docx-embedded image
    │
    ├─ ≥640px and acceptable quality ─────────► ⚪ open / no action needed
    │
    └─ <640px or low quality
         │
         ├─ same photo found online at higher res ────────► ✅ override saved
         │
         ├─ same photo found but bot-blocked download ────► 📋 manual-fetch.csv
         │
         └─ same photo not findable / only different photos ─► 🟡 investigated
```

## Pending — manual download required

See `src/content/bios-images-pending/manual-fetch.csv` and `src/content/bios-images-pending/README.md`. To resolve: download the image listed in `page_url`, save as `src/content/bios-images/<target_filename>`, then `npm run bios:process && npm run build`.

## Investigated — no same-image upgrade possible

Visually confirmed (by agent passes 1-3 in 2026-05-18 session): either the same photo is only online at the same/smaller resolution as the docx (often the docx author downloaded it from the very source we re-find), or all RIS candidates were different photos of the same person (substituting them would violate the "preserve author photo choice" rule). 49 entries total.

- `adatci-m-2021` (not_same_image): Candidates show Natsume Soseki (writer); docx is full Japanese page screenshot with small portrait
- `avenol-j-2015` (not_same_image): fi.wikipedia.org M_J_Avenol.jpg (542x750) shows same suit/glasses but face angle/eye direction differ from docx; d=26 reflects genuine pose diff not crop diff
- `baenasoares-j-2015` (not_findable): docx is B&W bald-with-glasses smile (Брокгауз ru.wikipedia style with watermark); OEA wiki photo is different (in front of own portrait painting); Honoris Causa photo is different
- `bertini-ca-2018` (not_same_image): Candidates show different woman (US Rep Liz Patterson); docx is Catherine Bertini in red dress with WFP logo
- `black-er-2014` (not_findable): Confirmed via hash-search: same image online only at 150x186 (current 165x205), no upgrade available
- `boerma-ah-2020` (not_same_image): Candidates show Boerma with pipe at chin level; docx is Boerma at desk with pipe at chest level
- `bustani-jm-2015` (not_same_image): Candidates show Bustani at podium; docx is at desk with Brazilian flag and bust
- `candau-mg-2015` (not_same_image): Candidates are studio portrait; docx is Candau standing in front of world map
- `cavalcanti-ge-2015` (not_same_image): Candidates show Cavalcanti standing by bookshelf; docx is studio portrait
- `cole-ws-2014` (not_same_image): Alamy candidate shows older Cole, different photo from docx (which has bowtie, younger pose)
- `crowdy-re-2014` (not_same_image): Candidates are different painting (front-facing); docx is side-profile with beaded necklace
- `davies-da-2016` (not_same_image): Candidates show different photo (Davies holding paper); docx is bow-tie desk portrait
- `de-boer-y-2016` (not_same_image): Candidates are Bali conference podium shot; docx is closer Bonn conference shot
- `drummond-je-2017` (not_findable): docx already 750x594 (matches candidate size); Wikipedia has different formal portrait
- `eichhoff-jj-2024` (not_same_image): Candidates are head-only painting; docx is full painting at desk with statue
- `gardiner-r-2014` (not_findable): Wikipedia Robert_Gardiner.jpg is only 184x274 (smaller than docx 216x288)
- `grant-jp-2016` (not_same_image): Candidates show different man (Scott Kellermann or Hermann Gmeiner); docx is James Grant in safari vest with child
- `hansenne-m-2016` (not_same_image): Candidates show bearded man; docx shows clean-shaven Hansenne smiling at desk
- `haveman-bw-2017` (not_same_image): Candidates face camera or show different scene; docx is left-profile
- `ingram-j-2014` (not_same_image): Candidates show LDS apostle (different man); docx is James Ingram smiling profile
- `keenleyside-hl-2016` (not_same_image): Candidates show Keenleyside at desk with glasses on book; docx is in armchair
- `kotaite-aa-2025` (not_same_image): Candidates are book cover head-only shot; docx is full-body at desk with glasses & ledger
- `mahler-h-2013` (not_same_image): Candidates are color photo with red tie; docx is B&W close-up
- `mansholt-sl-2013` (not_findable): Wikipedia portrait is forward-facing no pipe; candidate thumbs show different pipe photos
- `mcnamara-rs-2013` (not_findable): d=1 same-image candidates are 165x190 (same as docx); Wikipedia is different official portrait
- `nakajima-h-2019` (not_same_image): Candidates show Nakajima color at UN podium; docx is B&W white suit at WHO logo
- `nansen-f-2014` (not_findable): Best d=2 candidate (projects.au.dk) is 503x655, smaller than docx 549x712
- `orfila-wajl-2017` (not_same_image): Candidates show different man (color, different framing); docx is B&W close-up
- `orr-jb-2021` (not_findable): FAO directors.html circular crop 340x340; all 5 RIS hits are same FAO source at same size; WP photo is different portrait
- `phelan-ej-2016` (not_findable): ILO bw0158 photo at 342x420 matches docx exactly (d=4); same size as docx; ILO photolib has it but not larger
- `rey-f-2025` (not_findable): Francis Rey ECD Secretary; docx is distinctive oval B&W bowtie portrait with white mustache; Yandex misidentifies as other people (Joseph Davies, Heinrich Herkner); no online source found
- `ricupero-r-2013` (not_same_image): Candidates show smiling balder man with hand to chin; docx is Ricupero forward-facing with hair
- `salim-sa-2016` (not_findable): Confirmed via hash-search: same image found at smaller sizes only on aggregator sites
- `saouma-e-2013` (not_same_image): Candidates show Staffan de Mistura (different person); docx is Saouma at desk
- `spaak-p-h-2015` (not_same_image): Candidates are Spaak head shots without hand-to-face pose; docx has him holding glasses near face
- `stoppani-p-2025` (not_findable): Distinctive oval B&W with photographer signature "C. Ed Bosch Yenice"; Yandex all misidentifications (W.F. Bredin, Pedro de Alcantara); no online source
- `thomas-aa-2020` (not_findable): Iconic Albert Thomas at desk with telephone photo; ILO photolib has 100+ photos but specific desk-with-phone shot not findable via Wayback; ILO live site Cloudflare-blocked
- `unckel-p-2012` (not_findable): Confirmed via hash-search: candidates either same-size or different photos. Current 200x299 is best available
- `van-lennep-e-2017` (not_findable): Corbis-watermarked B&W laughing seated photo; WP photo is different forward-facing portrait; OECD Flickr photo not directly accessible
- `vieira-de-mello-s-2017` (not_findable): dhpedia source has same 180x242 size as docx, Wikimedia commons has different photos (d=38-45)
- `witteveen-hj-2016` (not_findable): docx is B&W close-up; Yandex misidentifies as other people (Theodore Schultz etc); WP photo is different 1984 portrait
- `wyndham-white-e-2012` (not_findable): WTO ww.jpg is d=0 match but only 200x251 (same as docx 200x251); no larger version online

## High-res open entries (no action — already ≥640px min side)

Acceptable resolution already; no override pursued.

- jenks-cw-2016 — 2881×3927
- lie-th-2017 — 2334×3000
- goad-ecv-2015 — 2113×2500
- butler-hb-2012 — 2082×3074
- morse-da-2013 — 1892×2566
- marjolin-re-2014 — 1892×1885
- diallo-bt-2022 — 1074×1280
- pastizzi-d-2024 — 934×804
- myrdal-g-2014 — 794×1123
- pate-m-2016 — 760×900
- gutt-c-2025 — 646×800
