# bios-images — portrait override uploads

This folder is the **media folder** for the CMS **"Bios"**
collection. When you upload a **Portrait override** on an entry's card, the image
lands here and its path is stored in that entry's
`src/data/entry-overrides/<slug>.json` (`portraitImage`). The build then uses it
for both the entry-page hero image and the listing's face-cropped portrait.

## Notes

- **Prefer the CMS.** Upload via the entry card; don't hand-drop files — the build
  reads the `portraitImage` path from the entry's JSON, not by scanning this
  folder. A file dropped here without a matching `portraitImage` is ignored.
- Leaving an entry's **Portrait override** empty uses the photo embedded in the
  Word file (the default).
- Long-term, the cleanest fix is a better image inside the source `.docx`; then
  clear the override.
