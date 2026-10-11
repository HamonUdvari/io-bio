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
  /** "draft": a DOI the mint reserved but has not published yet. */
  status?: string;
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
 *   the sandbox map, so its PDFs never cite a sandbox record. A draft record
 *   (a DOI reserved by the two-phase mint, not yet published) counts only in
 *   the mint build of its own env, so a deploy never shows an unpublished DOI.
 *   A production draft has no concept DOI yet, so it cites its reserved
 *   version DOI.
 */
export function citeFor(opts: {
  doi?: CiteRecord;
  sandbox?: CiteRecord;
  doiEnv: "sandbox" | "production";
  mintEnv?: string;
}): CiteResult {
  const { doiEnv, mintEnv } = opts;
  const usable = (r?: CiteRecord) =>
    r && (r.status !== "draft" || (!!mintEnv && r.env === mintEnv))
      ? r
      : undefined;
  const doi = usable(opts.doi);
  const sandbox = mintEnv === "production" ? undefined : usable(opts.sandbox);
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

/**
 * The citation URL a deposited PDF must link, as the mint build prints it:
 * the workflows build without ZENODO_ENV (so with the production map) and with
 * ZENODO_MINT_ENV=<env>. Note: once an entry has a production DOI, its sandbox
 * deposit cites that production DOI too, as the site does.
 */
export function mintCiteUrl(opts: {
  prod?: CiteRecord;
  sandbox?: CiteRecord;
  env: "sandbox" | "production";
}): string | undefined {
  return citeFor({
    doi: opts.prod,
    sandbox: opts.sandbox,
    doiEnv: "production",
    mintEnv: opts.env,
  }).cite?.url;
}
