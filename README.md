# IO BIO — Biographical Dictionary of Secretaries-General of International Organizations

## Editing IO BIO (for editors)

Live site: **https://hamonudvari.github.io/io-bio**

**To edit any file:** open it on GitHub → click the ✏️ (pencil) → make your change → **"Commit
changes"**. Committing *is* publishing — the site updates itself a few minutes later (see
[Publishing](#publishing-how-changes-go-live)).

> **First, always check your change on the preview page.** A few minutes after you commit (changes
> aren't instant), open what you edited to make sure it's right. For a biography, open its **Print
> preview** page — `…/io-bio/print/<slug>` — which shows the whole entry exactly as it renders and
> downloads as a PDF; you can also open the live entry at `…/io-bio/entries/<slug>`. There's no
> preview of *un-committed* edits — you check once it's live.

The tasks below are ordered from most to least common:

### 1. Add or update a biography entry

Each biography is a Word (`.docx`) file whose **name is the entry**: `Surname-Initial Year.docx` — e.g.
`Annan-KA 2019.docx` becomes the page `…/io-bio/entries/annan-ka-2019`. The heading, life dates,
biography text, Archives/Publications/Literature, portrait and citation are all read from the file
automatically.

- **Add a new entry:** GitHub → open **`src/content/bios/`** → **"Add file → Upload files"** → drop the
  `.docx` in → **Commit**.
- **Update an entry:** upload the corrected file under the **same name** to replace it (Word files can't
  be edited in the browser — edit in Word, then re-upload).

Follow the layout in the **Author Instructions** so the site reads it correctly.

### 2. Change website text

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

### 3. Add or update a downloadable file (PDF, etc.)

1. Put the file in the **`public/`** folder (GitHub → open `public` → **"Add file → Upload files"**). To
   replace one, upload a file with the same name.
2. Link to it with a leading slash and the filename only — **no `/io-bio`**:
   `[Databases Introduction (PDF)](/io-bio-databases-introduction.pdf)`
3. The existing download links in `src/content/pages/author-instructions.md` are the template — copy one
   and change the label + filename.

---

The rest are occasional fixes:

### 4. Use a bigger / better photo for an entry

The portrait comes from inside the Word file and is often small. To use a sharper/larger one:

- Add your image at **`src/content/bios-images/<slug>.jpg`** — `<slug>` is the entry's URL name (e.g.
  `annan-ka-2019`). It replaces the embedded photo on the next build. Don't put `-portrait` in the name
  (that's the auto-generated crop).
- **Formats:** JPG or PNG best; WebP, GIF, SVG also work. Bigger / higher-resolution = sharper (the grid
  thumbnail is auto-cropped to 800×1000). You must have the right to use the image.

### 5. Change which face is cropped (group photos)

If the auto-crop picks the wrong person in a group photo:

- Open **`src/data/portrait-subjects.json`** and add a line `"<slug>": N`, where **N is the person's
  position counting from the left** (1 = leftmost). Example: `"mcdonald-jg-2016": 1`.
- Commit — the crop is redone on the next build.

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
