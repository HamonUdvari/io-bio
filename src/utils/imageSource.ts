export interface ParsedImageSource {
  /** The credit text with the URL removed (e.g. "Photograph by Henry Palmer"). */
  text: string;
  /** The first URL in the credit, normalised to an absolute href, or null. */
  href: string | null;
  /** A short clickable label for the href (the hostname, sans "www."), or null. */
  label: string | null;
}

/**
 * Image credit parsing: if the source contains a URL, return the host as a
 * short, clickable `label` with the full `href` (long source URLs otherwise
 * overflow the rotated caption on the entry page). Non-URL sources return
 * `text` verbatim with `href`/`label` null.
 *
 * Shared by the entry-page credit (EntryArticle.astro) and the image-source
 * CSV export (scripts/export-image-sources.ts) so the link shown on-site and
 * the link audited in the CSV are always the same one.
 */
export function parseImageSource(src?: string | null): ParsedImageSource {
  if (!src) return { text: "", href: null, label: null };
  const m = src.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (!m) return { text: src, href: null, label: null };
  const raw = m[0].replace(/[).,;]+$/, "");
  const href = raw.startsWith("http") ? raw : `https://${raw}`;
  let label = raw;
  try {
    label = new URL(href).hostname.replace(/^www\./, "");
  } catch {}
  const text = src
    .slice(0, m.index)
    .replace(/[\s/–—-]+$/, "")
    .trim();
  return { text, href, label };
}
