[![DOI](https://zenodo.org/badge/1158709900.svg)](https://doi.org/10.5281/zenodo.18652171)

## Image pipeline

```
src/content/bios-source/         author docx (source of truth)
   ↓ scripts/process-bios.ts (cosmetic fixes)
src/content/bios-processed/      docx Astro reads via docxLoader.ts
   ↓ docxLoader extracts attachments
src/assets/bios-extracted/<slug>.<ext>     ← raw docx images (gitignored, reference)
   │
   ├─ if override exists ─────→ src/content/bios-images/<slug>.<ext>   ← curated/AI-upscaled (tracked)
   │
   └─ otherwise ──────────────→ src/assets/bios-extracted/<slug>.<ext>
                                       │
                                       ↓ copied to active location
                                src/assets/bios/<slug>.<ext>           ← what site renders (gitignored)
                                src/assets/bios/<slug>-portrait.jpg    ← face-detected 800×1000 grid crop
```

**Adding a higher-quality replacement image:** drop a file at
`src/content/bios-images/<slug>.<ext>` (matching the entry slug) and run
`npm run bios:process && npm run build`. The override is picked up
automatically.

**Authors are responsible for copyright clearance** of any image they
submit, whether in the docx or as a separate override.

### History — image quality improvements (May 2026)

We did one large pass to upgrade portrait quality across all entries.
Starting from 111 docx-embedded images (mostly small, often <300px on
the min side):

1. **Reverse-image-search**: tried Yandex / Google / Bing to find the
   same photo at higher resolution. Yielded ~20 overrides where a clean
   larger copy existed on a UN agency / Wikimedia / archival site.
   Visually verified each was the same photo (not a different shot of
   the same person at low dHash distance).
2. **Manual UN-system lookups**: a separate list of entries where the
   subject is a UN-system figure (UNESCO, WHO, UNDP, etc.) — these can
   sometimes be hand-grabbed from `media.un.org` and similar agency
   archives at high resolution.
3. **AI upscale (Cloud Wonder, 4×)**: for the remaining ~52 entries
   without a same-image online upgrade, AI-upscaled the docx-embedded
   images. Results were good enough across the board that this is the
   recommended path going forward for any new low-resolution docx.

Result: 85 overrides applied (out of 107 unique entries). Mean upgrade
factor ~3.8×.
