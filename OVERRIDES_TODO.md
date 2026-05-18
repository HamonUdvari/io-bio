# Image overrides — TODO checklist

**Last update:** 2026-05-19. Regenerable from the source-of-truth files.

## Snapshot

| Bucket | Count |
|---|---|
| ✅ Override applied | 40 |
| 📋 Pending manual fetch (CSV) | 14 |
| 🟡 Investigated, no upgrade possible | 53 |
| 🔓 Remaining unaddressed | 0 |
| **Total unique entries** | **107** |

**Every entry is now classified.** Mean upgrade for the 40 applied overrides: see `node scripts/_final-summary.mjs`.

## How an entry gets classified

```
docx-embedded portrait
    │
    ├─ same photo found at higher resolution ─────► ✅ override applied
    │     (saved to src/content/bios-images/<slug>.<ext>)
    │
    ├─ same photo found but page is bot-protected ─► 📋 manual fetch
    │     (entry in src/content/bios-images-pending/manual-fetch.csv)
    │
    └─ no same-photo upgrade available ────────────► 🟡 investigated
         (logged in /tmp/img-fetch/agent-results.tsv)
         Reasons fall into:
           a) same photo exists online only at same/smaller resolution
           b) all online candidates are different photos of same person
           c) docx image is already the best available copy online
```

## Pending — manual download required (14)

See `src/content/bios-images-pending/manual-fetch.csv`. Download each `page_url`, save as `target_filename` into `src/content/bios-images/`, then `npm run bios:process && npm run build`.

## Remaining unaddressed entries

None. Every entry has been classified.

## Investigated — no upgrade possible

Total: 53. Per-entry reasons logged in `/tmp/img-fetch/agent-results.tsv`. Categories below:

### `already_best` (11)

- `butler-hb-2012`: Sepia Harold Butler portrait 2082x3074; Wikimedia "Harold_Butler_in_1947" is a different photo (dark bg); docx is already excellent quality
- `diallo-bt-2022`: Diallo Telli colorized robes portrait 1074x1280; Wikipedia "Diallo_Telli.png" is SAME photo B&W at only 198x300 — confirms it's the same; docx is larger and colorized
- `goad-ecv-2015`: Edward Colin Viner Goad (IMCO SG) at telephone 2113x2500; WM candidate at d=26 is "Cals at telephone" — different person; IMO Former SG page does not list him with image
- `gutt-c-2025`: UN Photo watermarked B&W portrait 646x800; same-size hit on media.un.org (d=5); Wikimedia "Camille_Gutt.jpg" is a different photo (reading speech); no larger UN DAM source accessible
- `jenks-cw-2016`: Wilfred Jenks ILO leaning-forward portrait 2881x3927; all RIS top5 are different people (d=34+); no Wikimedia portrait found for Clarence Wilfred Jenks
- `lie-th-2017`: Trygve Lie low-key dark portrait 2334x3000; mungfali.com has same at d=3 same size; Wikimedia "Trygve_Lie.png" is a painted portrait (different); no UN Photo accessible
- `marjolin-re-2014`: Young Marjolin portrait 1892x1885; Wikimedia "Robert_Marjolin_(1964)" is different (older 1964); no other matches
- `morse-da-2013`: Iconic David Morse hands-clasped seated portrait 1892x2566; WNYC has same photo at d=2 but only 497x678; Wikimedia "David_A_Morse" is tiny 110x162
- `myrdal-g-2014`: Distinctive desk-with-telephone-and-portrait-wall photo 794x1123; no online matches; Nobel Prize site portrait is different (older face); Wikimedia has different photos (with Alva)
- `pastizzi-d-2024`: Dragica Pastizzi-Ferenčić (Croatian) - distinctive smile B&W 934x804; Yandex misidentifies (Bekhtereva); no Wikipedia or larger online source
- `pate-m-2016`: Iconic Maurice Pate desk portrait 760x900; dnkldharma.org has identical 760x900 (d=4); Wikimedia "UNICEF_Exekutivdirektor_Maurice_Pate_1946" is a different/smaller photo

### `not_findable` (18)

- `baenasoares-j-2015`: docx is B&W bald-with-glasses smile (Брокгауз ru.wikipedia style with watermark); OEA wiki photo is different (in front of own portrait painting); Honoris Causa photo is different
- `black-er-2014`: Confirmed via hash-search: same image online only at 150x186 (current 165x205), no upgrade available
- `drummond-je-2017`: docx already 750x594 (matches candidate size); Wikipedia has different formal portrait
- `gardiner-r-2014`: Wikipedia Robert_Gardiner.jpg is only 184x274 (smaller than docx 216x288)
- `mansholt-sl-2013`: Wikipedia portrait is forward-facing no pipe; candidate thumbs show different pipe photos
- `mcnamara-rs-2013`: d=1 same-image candidates are 165x190 (same as docx); Wikipedia is different official portrait
- `nansen-f-2014`: Best d=2 candidate (projects.au.dk) is 503x655, smaller than docx 549x712
- `orr-jb-2021`: FAO directors.html circular crop 340x340; all 5 RIS hits are same FAO source at same size; WP photo is different portrait
- `phelan-ej-2016`: ILO bw0158 photo at 342x420 matches docx exactly (d=4); same size as docx; ILO photolib has it but not larger
- `rey-f-2025`: Francis Rey ECD Secretary; docx is distinctive oval B&W bowtie portrait with white mustache; Yandex misidentifies as other people (Joseph Davies, Heinrich Herkner); no online source found
- `salim-sa-2016`: Confirmed via hash-search: same image found at smaller sizes only on aggregator sites
- `stoppani-p-2025`: Distinctive oval B&W with photographer signature "C. Ed Bosch Yenice"; Yandex all misidentifications (W.F. Bredin, Pedro de Alcantara); no online source
- `thomas-aa-2020`: Iconic Albert Thomas at desk with telephone photo; ILO photolib has 100+ photos but specific desk-with-phone shot not findable via Wayback; ILO live site Cloudflare-blocked
- `unckel-p-2012`: Confirmed via hash-search: candidates either same-size or different photos. Current 200x299 is best available
- `van-lennep-e-2017`: Corbis-watermarked B&W laughing seated photo; WP photo is different forward-facing portrait; OECD Flickr photo not directly accessible
- `vieira-de-mello-s-2017`: dhpedia source has same 180x242 size as docx, Wikimedia commons has different photos (d=38-45)
- `witteveen-hj-2016`: docx is B&W close-up; Yandex misidentifies as other people (Theodore Schultz etc); WP photo is different 1984 portrait
- `wyndham-white-e-2012`: WTO ww.jpg is d=0 match but only 200x251 (same as docx 200x251); no larger version online

### `not_same_image` (24)

- `adatci-m-2021`: Candidates show Natsume Soseki (writer); docx is full Japanese page screenshot with small portrait
- `avenol-j-2015`: fi.wikipedia.org M_J_Avenol.jpg (542x750) shows same suit/glasses but face angle/eye direction differ from docx; d=26 reflects genuine pose diff not crop diff
- `bertini-ca-2018`: Candidates show different woman (US Rep Liz Patterson); docx is Catherine Bertini in red dress with WFP logo
- `boerma-ah-2020`: Candidates show Boerma with pipe at chin level; docx is Boerma at desk with pipe at chest level
- `bustani-jm-2015`: Candidates show Bustani at podium; docx is at desk with Brazilian flag and bust
- `candau-mg-2015`: Candidates are studio portrait; docx is Candau standing in front of world map
- `cavalcanti-ge-2015`: Candidates show Cavalcanti standing by bookshelf; docx is studio portrait
- `cole-ws-2014`: Alamy candidate shows older Cole, different photo from docx (which has bowtie, younger pose)
- `crowdy-re-2014`: Candidates are different painting (front-facing); docx is side-profile with beaded necklace
- `davies-da-2016`: Candidates show different photo (Davies holding paper); docx is bow-tie desk portrait
- `de-boer-y-2016`: Candidates are Bali conference podium shot; docx is closer Bonn conference shot
- `eichhoff-jj-2024`: Candidates are head-only painting; docx is full painting at desk with statue
- `grant-jp-2016`: Candidates show different man (Scott Kellermann or Hermann Gmeiner); docx is James Grant in safari vest with child
- `hansenne-m-2016`: Candidates show bearded man; docx shows clean-shaven Hansenne smiling at desk
- `haveman-bw-2017`: Candidates face camera or show different scene; docx is left-profile
- `ingram-j-2014`: Candidates show LDS apostle (different man); docx is James Ingram smiling profile
- `keenleyside-hl-2016`: Candidates show Keenleyside at desk with glasses on book; docx is in armchair
- `kotaite-aa-2025`: Candidates are book cover head-only shot; docx is full-body at desk with glasses & ledger
- `mahler-h-2013`: Candidates are color photo with red tie; docx is B&W close-up
- `nakajima-h-2019`: Candidates show Nakajima color at UN podium; docx is B&W white suit at WHO logo
- `orfila-wajl-2017`: Candidates show different man (color, different framing); docx is B&W close-up
- `ricupero-r-2013`: Candidates show smiling balder man with hand to chin; docx is Ricupero forward-facing with hair
- `saouma-e-2013`: Candidates show Staffan de Mistura (different person); docx is Saouma at desk
- `spaak-p-h-2015`: Candidates are Spaak head shots without hand-to-face pose; docx has him holding glasses near face

