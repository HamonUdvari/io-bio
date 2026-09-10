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
- **Bio Word files** — managed via the **Asset Library** (the "media" view): the global
  `media_folder` points at `src/content/bios/`, so editors browse, **add and replace the `.docx`
  files** there directly — nothing else, no metadata entries. `docxLoader` reads them on build.
  (Page downloads/PDFs use the Pages collection's own `media_folder: public`, which also appears
  as a second folder in the Asset Library.)

Verified with Playwright (Chromium) against a `test-repo` backend: the config parses, the
collections render (Site text, Pages), and the section block editor shows its Add-Section /
heading / style / width / content fields. The login screen offers "Sign in with Token" (no
Cloudflare).

### How the section blocks render

Pages store a `sections` list in frontmatter (`src/content/pages/*.md`);
`src/components/PageSections.astro` renders each block with the **same** section/columns
markup + markdown pipeline as before, so output is byte-identical to the old pages
(verified). The homepage `entries.mdx` still uses a Markdown body (it embeds components),
and `src/pages/[...slug].astro` renders whichever form a page uses.

## TODO (needs a real backend/upload to confirm — test-repo can't show real files)

- **Bio `.docx` in the Asset Library** — `media_folder` points at `src/content/bios`. In the
  running CMS (local backend), confirm the Asset Library **lists the existing `.docx`** and that
  **upload (add) and re-upload (replace)** work as expected.
- **Downloads (PDFs)** — Pages `media_folder: public`; confirm a real PDF upload lands in `public/`
  and the `/io-bio` base path resolves.
- **Face-crop overrides** (`src/data/portrait-subjects.json`) — an arbitrary-key JSON map; needs a
  `keyvalue`-style widget (verify it exists in this Sveltia version) or leave as a direct-edit file.
- **Live login** — verify the "Sign in with Token" flow once with a real GitHub fine-grained token.
- Do **not** merge to `main` / deploy until the live token login + a real edit are confirmed.
