[![DOI](https://zenodo.org/badge/1158709900.svg)](https://doi.org/10.5281/zenodo.18652171)

# IO BIO — Biographical Dictionary of Secretaries-General of International Organizations

**Editors:** the section below is for maintaining the site through GitHub's website — no coding
needed. Developer/build notes are further down.

## Editing IO BIO (for editors)

Live site: **https://hamonudvari.github.io/io-bio**

**To edit any file:** open it on GitHub → click the ✏️ (pencil) → make your change → **"Commit
changes"**. Committing *is* publishing — the site updates itself a few minutes later (see
[Publishing](#publishing-how-changes-go-live)). Ordered from most to least common:

### 1. Change website text

Edit the matching file:

- **Home page text** → `src/content/globals/hero.md`
- **About page** → `src/content/pages/about.md`
- **Author Instructions page** → `src/content/pages/author-instructions.md`
- **Footer** → `src/content/globals/footer.md`
- **Browser-tab title / search-result description** (fallback) → `src/content/globals/global.md`
- **A page's menu name & position** → the `navLabel` and `order` lines at the top of that page file
  (smaller `order` = further left in the menu)

Writing tips: normal Markdown — `**bold**`, `*italic*`, `## Heading`, `- bullet`. Coloured section
boxes use `::::section{title="…" variant="primary"}` … `::::`. To link to another page write
`[text](/author-instructions)` — **don't** add `/io-bio`, it's added for you.

### 2. Add a downloadable file (e.g. a PDF) and link to it

1. Put the file in the **`public/`** folder (GitHub → open `public` → **"Add file → Upload files"**).
2. Link to it with a leading slash and the filename only — **no `/io-bio`**:
   `[Databases Introduction (PDF)](/io-bio-databases-introduction.pdf)`
3. The existing download links in `src/content/pages/author-instructions.md` are the template — copy
   one and change the label + filename.

### 3. Use a bigger / better photo for an entry

The entry photo comes from the author's Word file and is often small. To use a sharper/larger one:

- Add your image at **`src/content/bios-images/<slug>.jpg`**, where `<slug>` is the entry's URL name
  (e.g. `annan-ka-2019` for `…/entries/annan-ka-2019`).
- It replaces the original on the next build. Don't put `-portrait` in the name — that's reserved for
  the auto-generated crop.

### 4. Which picture formats work

- Best: **JPG** or **PNG**. Also accepted: WebP, GIF, SVG.
- Bigger / higher-resolution is better — the small grid thumbnail is auto-cropped to 800×1000.
- Make sure you have the right to use the image — copyright clearance is the author's responsibility.

### 5. Preview / check an entry looks right

- There's **no preview of un-committed edits**. Changes appear on the live site a few minutes after
  you commit (see [Publishing](#publishing-how-changes-go-live)).
- After it deploys, open the entry `…/io-bio/entries/<slug>` to check the text and photo.
- To check the **printable / PDF** version, click **"Print preview"** or **"Download (PDF)"** on the
  entry (or go to `…/io-bio/print/<slug>`).

### 6. Fix which face is cropped (group photos)

If the auto-crop picks the wrong person in a group photo:

- Open **`src/data/portrait-subjects.json`** and add a line `"<slug>": N`, where **N is the person's
  position counting from the left** (1 = leftmost). Example: `"mcdonald-jg-2016": 1`.
- Commit — the crop is redone on the next build.

> **Adding a whole new biography?** Add the author's `.docx` to `src/content/bios-processed/`, named
> `Surname-Initial Year.docx` (e.g. `Annan-KA 2019.docx`). The entry and its web address are created
> automatically.

## Publishing (how changes go live)

- **Committing a change on GitHub _is_ publishing.** GitHub rebuilds and republishes the whole site
  automatically — usually **3–6 minutes** later (not instant; it re-renders every entry's PDF).
- You never press a separate "publish" button. If you make several edits in a row, that's fine: the
  **newest commit wins**, and any older build still running is cancelled automatically.
- Tip: when convenient, make related edits together so the site rebuilds once instead of many times
  (not required — just faster).
- **If a run looks stuck or failed** — GitHub → **Actions** tab → **"Deploy to GitHub Pages"**:
  - watch a run's progress live;
  - **"Run workflow"** → publish the current site again by hand;
  - **Cancel** → stop a stuck run;
  - **"Re-run jobs"** → retry a run that failed.

---

*The rest of this README is developer/build reference.*

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
