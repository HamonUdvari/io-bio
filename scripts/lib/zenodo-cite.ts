// The "How to cite" link of one entry, from the DOI maps: what the entry page
// and its PDF print. No imports: the content loader and the mint share this
// rule, and it pulls nothing else into the site build.

/** One entry's record in a DOI map (src/data/zenodo-dois[.sandbox].json). */
export interface CiteRecord {
  recordId?: number | string;
  conceptRecId?: number | string;
  versionDoi?: string;
  conceptDoi?: string;
  env?: string;
}

export interface ZenodoCite {
  url: string;
  sandbox: boolean;
}

export interface CiteResult {
  /** DOIs the loader stores on the entry data. */
  versionDoi?: string;
  conceptDoi?: string;
  /** The "How to cite" link, if any. */
  cite?: ZenodoCite;
  /** The production map held a sandbox DOI, which was ignored. */
  ignoredSandboxDoi?: boolean;
}

const isSandboxDoi = (s?: string) => !!s && s.startsWith("10.5072/");

/**
 * - `doi`: the entry's record in the map the loader reads for `doiEnv` (the
 *   production map, unless ZENODO_ENV=sandbox).
 * - `sandbox`: its record in the sandbox map.
 * - `mintEnv`: ZENODO_MINT_ENV of the build. The production mint build skips
 *   the sandbox map, so its PDFs never cite a sandbox record; an entry then
 *   prints no citation until it has a production DOI.
 */
export function citeFor(opts: {
  doi?: CiteRecord;
  sandbox?: CiteRecord;
  doiEnv: "sandbox" | "production";
  mintEnv?: string;
}): CiteResult {
  const { doi, doiEnv } = opts;
  const sandbox = opts.mintEnv === "production" ? undefined : opts.sandbox;
  const out: CiteResult = {};
  if (doi && (!doi.env || doi.env === doiEnv)) {
    if (
      doiEnv === "production" &&
      (isSandboxDoi(doi.versionDoi) || isSandboxDoi(doi.conceptDoi))
    ) {
      out.ignoredSandboxDoi = true;
    } else {
      if (doi.versionDoi) out.versionDoi = doi.versionDoi;
      if (doi.conceptDoi) out.conceptDoi = doi.conceptDoi;
    }
  }
  // Prefer a real DOI (resolves via doi.org), concept before version; else the
  // sandbox deposit's CONCEPT record (always the latest version). Sandbox DOIs
  // (10.5072) do not resolve at doi.org, so they route to the record page.
  const prodDoi = [out.conceptDoi, out.versionDoi].find(
    (d) => d && !isSandboxDoi(d),
  );
  if (prodDoi) {
    out.cite = { url: `https://doi.org/${prodDoi}`, sandbox: false };
  } else if (sandbox && (sandbox.conceptRecId || sandbox.recordId)) {
    const recId = sandbox.conceptRecId ?? sandbox.recordId;
    out.cite = {
      url: `https://sandbox.zenodo.org/records/${recId}`,
      sandbox: true,
    };
  }
  return out;
}
