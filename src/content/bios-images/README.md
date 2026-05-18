# bios-images — optional high-resolution overrides

Drop a high-resolution portrait here named after the entry slug to replace the docx-embedded portrait. The loader will use the override as the source for both the entry-page hero image and the listing's face-cropped portrait.

## Convention

- Filename: `<slug>.<ext>` (e.g. `annan-ka-2019.jpg`).
- Extensions accepted (first match wins): `.jpg`, `.jpeg`, `.png`, `.webp`.
- The slug is derived from the docx filename — lowercase the basename and replace spaces with dashes. E.g. `Annan-KA 2019.docx` → `annan-ka-2019`.

## When to use

- The docx-embedded portrait is too low resolution and looks bad on the site.
- You found a higher-quality public-domain or rights-cleared portrait via reverse image search.
- The author hasn't yet updated their docx; this lets you ship the better image now and roll it back later by deleting the file here.

## Workflow

1. Drop `<slug>.jpg` (or other supported ext) into this folder.
2. `rm src/assets/bios/<base>-image1-portrait.jpg` to invalidate the cached crop (the loader skips the crop step when a portrait file already exists).
3. `npm run build` (or restart `npm run dev`). The loader logs `[docx] <slug>: using override <slug>.jpg`.

Long-term, the fix is to put the higher-quality image inside the source docx itself — at which point you can delete the override from here.
