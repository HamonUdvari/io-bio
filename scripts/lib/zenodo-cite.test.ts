import { describe, expect, it } from "vitest";
import { citeFor } from "./zenodo-cite.ts";
import type { CiteRecord } from "./zenodo-cite.ts";

type Env = "sandbox" | "production";
const isSandboxDoi = (s?: string) => !!s && s.startsWith("10.5072/");

// The loader's rule before citeFor existed (docxLoader.ts in release 1.27.4),
// kept here to prove that citeFor gives the same result in every case. The
// production mint build (ZENODO_MINT_ENV=production) read an empty sandbox map.
function oldLoaderRule(
  doi: CiteRecord | undefined,
  sandboxRecord: CiteRecord | undefined,
  env: Env,
  mintEnv: string | undefined,
) {
  const sb = mintEnv === "production" ? undefined : sandboxRecord;
  const data: Record<string, unknown> = {};
  if (doi && (!doi.env || doi.env === env)) {
    if (
      env === "production" &&
      (isSandboxDoi(doi.versionDoi) || isSandboxDoi(doi.conceptDoi))
    ) {
      data.warned = true;
    } else {
      if (doi.versionDoi) data.versionDoi = doi.versionDoi;
      if (doi.conceptDoi) data.conceptDoi = doi.conceptDoi;
    }
  }
  const prodDoi = [data.conceptDoi, data.versionDoi].find(
    (d) => d && !isSandboxDoi(d as string),
  );
  if (prodDoi)
    data.zenodoCite = { url: `https://doi.org/${prodDoi}`, sandbox: false };
  else if (sb && (sb.conceptRecId || sb.recordId))
    data.zenodoCite = {
      url: `https://sandbox.zenodo.org/records/${sb.conceptRecId ?? sb.recordId}`,
      sandbox: true,
    };
  return data;
}

const DOI_RECORDS: (CiteRecord | undefined)[] = [
  undefined,
  {
    recordId: 12,
    conceptDoi: "10.5281/zenodo.11",
    versionDoi: "10.5281/zenodo.12",
    env: "production",
  },
  {
    recordId: 12,
    conceptDoi: "10.5281/zenodo.11",
    versionDoi: "10.5281/zenodo.12",
  },
  {
    recordId: 12,
    conceptDoi: "",
    versionDoi: "10.5281/zenodo.12",
    env: "production",
  },
  {
    recordId: 12,
    conceptDoi: "10.5281/zenodo.11",
    versionDoi: "10.5281/zenodo.12",
    env: "sandbox",
  },
  {
    recordId: 5,
    conceptDoi: "10.5072/zenodo.1",
    versionDoi: "10.5072/zenodo.5",
    env: "production",
  },
  {
    recordId: 5,
    conceptDoi: "10.5072/zenodo.1",
    versionDoi: "10.5072/zenodo.5",
    env: "sandbox",
  },
  // A sandbox concept with a real version DOI: concept first, but only a
  // real DOI may become the doi.org link.
  {
    recordId: 12,
    conceptDoi: "10.5072/zenodo.1",
    versionDoi: "10.5281/zenodo.12",
  },
];
const SANDBOX_RECORDS: (CiteRecord | undefined)[] = [
  undefined,
  { recordId: 5, conceptRecId: 1 },
  { recordId: 5 },
  { conceptRecId: "1" },
  {},
];

describe("citeFor", () => {
  const cases = DOI_RECORDS.flatMap((doi) =>
    SANDBOX_RECORDS.flatMap((sb) =>
      (["production", "sandbox"] as Env[]).flatMap((env) =>
        [undefined, "sandbox", "production"].map(
          (mintEnv) => [doi, sb, env, mintEnv] as const,
        ),
      ),
    ),
  );

  it.each(cases)(
    "matches the old loader rule (%j, %j, %s, mint %s)",
    (doi, sb, env, mintEnv) => {
      const r = citeFor({ doi, sandbox: sb, doiEnv: env, mintEnv });
      const now: Record<string, unknown> = {};
      if (r.ignoredSandboxDoi) now.warned = true;
      if (r.versionDoi) now.versionDoi = r.versionDoi;
      if (r.conceptDoi) now.conceptDoi = r.conceptDoi;
      if (r.cite) now.zenodoCite = r.cite;
      expect(now).toEqual(oldLoaderRule(doi, sb, env, mintEnv));
    },
  );

  it("never cites the sandbox in the production mint build", () => {
    const sandbox = { recordId: 5, conceptRecId: 1 };
    expect(citeFor({ sandbox, doiEnv: "production" }).cite?.sandbox).toBe(true);
    expect(
      citeFor({ sandbox, doiEnv: "production", mintEnv: "production" }).cite,
    ).toBeUndefined();
  });
});
