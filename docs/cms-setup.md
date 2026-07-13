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

### How the section blocks render

Pages store a `sections` list in frontmatter (`src/content/pages/*.md`);
`src/components/PageSections.astro` renders each block with the **same** section/columns
markup + markdown pipeline as before, so output is byte-identical to the old pages
(verified). The homepage `entries.mdx` still uses a Markdown body (it embeds components),
and `src/pages/[...slug].astro` renders whichever form a page uses.

## TODO (needs interactive verification in the browser)

- **Bios (.docx upload)** — a Git CMS can't rich-edit `.docx`; editors will upload/replace
  the `.docx` in `src/content/bios/` as files. The exact Sveltia mechanism (media upload vs
  a file-widget wrapper) needs to be tried in the running CMS and finalized.
- **Portrait images** (`src/content/bios-images/<slug>.<ext>`) and **face-crop overrides**
  (`src/data/portrait-subjects.json`) — add as media/collection once verified.
- **Downloads** — PDFs live in `public/`; editors upload via the media button. Confirm the
  base-path handling on a real upload.
- Do **not** merge to `main` / deploy until the live token login + these items are verified.
