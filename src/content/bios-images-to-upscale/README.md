# Images to AI-upscale

52 docx-embedded portraits for entries that (a) don't have a same-photo high-res override available online and (b) currently render below 800px on the min side. AI upscaling is a reasonable last-resort improvement here.

## Workflow

1. Pick a tool: **Topaz Gigapixel**, **Real-ESRGAN**, **Upscayl** (free, GUI), or anything similar. For studio portraits, models tuned for "photo" or "high-fidelity" generally beat the default. Avoid "art" / "anime" models — they over-smooth faces.
2. Drop the files in this folder into the upscaler. The included `manifest.csv` lists the current dimensions and a suggested factor (2× for ≥250px sources, 4× for very small ones; reach for higher only if the tool clearly preserves identity).
3. Save the upscaled output back to **`src/content/bios-images/<slug>.<ext>`** (the same slug as the source filename). The override pipeline picks it up automatically on next build.
4. From the repo root: `npm run bios:process && npm run build` and visually verify each in the grid.

## Caveats

- Upscalers can subtly alter faces — particularly eye shape, mole/freckle placement, hairline. After upscaling, eyeball each result against the original docx photo at a similar zoom before promoting to override.
- **High upscale factor + low file size = visible artifact territory.** From past experience, robertson-gim-2018 was a manual upscale that ended up with blocky hair gradients and plastic skin; we removed it. Look out for those.
- The pipeline has a soft-guard: any override with upgrade factor > 8× AND bytes-per-pixel < 0.10 will be flagged in build logs (not blocked — you can still keep them).
- `manifest.csv` columns: `slug, filename, current_w, current_h, minSide, suggested_upscale_factor`.

## Source

Generated 2026-05-19 by `OVERRIDES_TODO.md` → "Investigated, no same-image upgrade possible" plus entries that were never overridden and have minSide < 800.
