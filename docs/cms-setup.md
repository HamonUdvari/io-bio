# Sveltia CMS — setup & status (branch `feat/sveltia-cms`)

A friendly editing UI for non-technical editors, on top of the same Git repo.
Lives at `public/admin/` (`index.html` + `config.yml`), deployed to `/io-bio/admin/`.

## Test it locally (recommended before going live)

Sveltia's local mode needs **no server/proxy** — just a Chromium browser:

1. `pnpm dev`
2. Open **`http://localhost:<port>/io-bio/admin/index.html`** in **Chrome / Edge / Brave**
   (not Firefox/Safari — it uses the File System Access API).
3. Click **"Work with Local Repository"** and pick the `io-bio` repo root.
4. Edit → it writes the real files; preview at `http://localhost:<port>/io-bio/`.

## Live login — no Cloudflare, works directly with GitHub

GitHub doesn't yet support the backend-free (PKCE) OAuth flow, so **one-click "Log in
with GitHub" would need a small auth backend** (deliberately avoided here). Instead:

- On the CMS login screen editors click **"Sign in with Token"** and paste a GitHub
  **fine-grained personal access token** scoped to `HamonUdvari/io-bio`
  (Contents: read/write). GitHub gives a pre-filled generation link. No extra hosting.
- When GitHub ships client-side PKCE, this becomes one-click with still no backend —
  no config change needed.

## What the CMS manages now

- **Site text** — Home hero, Footer, Browser-tab/search text (`src/content/globals/*.md`).
- **Pages** — About & Author Instructions via a **section block editor**: add / reorder /
  delete section blocks, each with a heading, style (primary/secondary), width (base/wide)
  and rich-text content. No `::::section` syntax for editors.
- **Biographies** — a "Biographies" collection to **add a new bio** by uploading its `.docx`
  (+ an optional better photo). The `.docx` lands in `src/content/bios/` and `docxLoader`
  reads it. See the caveats under TODO.

Verified with Playwright (Chromium) against a `test-repo` backend: the config parses, all
three collections render, and the section block editor shows its Add-Section / heading /
style / width / content fields. The login screen offers "Sign in with Token" (no Cloudflare).

### How the section blocks render

Pages store a `sections` list in frontmatter (`src/content/pages/*.md`);
`src/components/PageSections.astro` renders each block with the **same** section/columns
markup + markdown pipeline as before, so output is byte-identical to the old pages
(verified). The homepage `entries.mdx` still uses a Markdown body (it embeds components),
and `src/pages/[...slug].astro` renders whichever form a page uses.

## TODO (needs a real upload / real backend to confirm)

- **Bios upload path** — the config uploads the `.docx` to `/src/content/bios` and the photo to
  `/src/content/bios-images` via per-field `media_folder`. Rendering is verified, but do one
  real upload (local backend) to confirm the file lands in the right folder and builds.
- **Existing bios** — the "Biographies" collection lists sidecar entries in `src/data/bios-cms/`,
  so the ~110 existing `.docx` (no sidecar) don't appear yet. Decide: leave existing bios managed
  as today (GitHub) and use the CMS only to *add* new ones, or backfill sidecars.
- **Face-crop overrides** (`src/data/portrait-subjects.json`) — an arbitrary-key JSON map; needs a
  `keyvalue`-style widget (verify it exists in this Sveltia version) or leave as a direct-edit file.
- **Downloads (PDFs)** — editors upload via the media button (`media_folder: public`); confirm the
  base-path handling on a real upload.
- **Live login** — verify the "Sign in with Token" flow once with a real GitHub fine-grained token.
- Do **not** merge to `main` / deploy until the live token login + a real edit are confirmed.
