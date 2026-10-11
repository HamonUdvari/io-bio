import { describe, expect, it } from "vitest";
import { citeFor, mintCiteUrl } from "./zenodo-cite.ts";
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

describe("citeFor: draft records (DOIs reserved, not yet published)", () => {
  const prodDraft = {
    recordId: 40,
    conceptDoi: "",
    versionDoi: "10.5281/zenodo.40",
    env: "production",
    status: "draft",
  };
  const sandboxDraft = {
    recordId: 50,
    conceptRecId: 49,
    conceptDoi: "",
    versionDoi: "10.5072/zenodo.50",
    env: "sandbox",
    status: "draft",
  };

  it("cites a production draft's reserved DOI in the production mint build", () => {
    expect(
      citeFor({ doi: prodDraft, doiEnv: "production", mintEnv: "production" }),
    ).toEqual({
      versionDoi: "10.5281/zenodo.40",
      cite: { url: "https://doi.org/10.5281/zenodo.40", sandbox: false },
    });
  });

  it("cites a sandbox draft's concept record in the sandbox mint build", () => {
    expect(
      citeFor({
        sandbox: sandboxDraft,
        doiEnv: "production",
        mintEnv: "sandbox",
      }).cite,
    ).toEqual({
      url: "https://sandbox.zenodo.org/records/49",
      sandbox: true,
    });
  });

  it.each([undefined, "sandbox"])(
    "ignores a production draft when the mint env is %s",
    (mintEnv) => {
      expect(
        citeFor({ doi: prodDraft, doiEnv: "production", mintEnv }),
      ).toEqual({});
    },
  );

  it.each([undefined, "production"])(
    "ignores a sandbox draft when the mint env is %s",
    (mintEnv) => {
      expect(
        citeFor({ sandbox: sandboxDraft, doiEnv: "production", mintEnv }).cite,
      ).toBeUndefined();
    },
  );

  it("treats a record without status as published", () => {
    const { status: _, ...published } = sandboxDraft;
    expect(
      citeFor({ sandbox: published, doiEnv: "production" }).cite?.url,
    ).toBe("https://sandbox.zenodo.org/records/49");
  });
});

describe("mintCiteUrl (what the mint build prints; the deposit guard)", () => {
  const sandboxRec = {
    recordId: 618715,
    conceptRecId: 506411,
    conceptDoi: "10.5072/zenodo.506411",
    versionDoi: "10.5072/zenodo.618715",
    env: "sandbox",
  };
  const prodRec = {
    recordId: 12,
    conceptRecId: 11,
    conceptDoi: "10.5281/zenodo.11",
    versionDoi: "10.5281/zenodo.12",
    env: "production",
  };

  it("(a) a sandbox new version cites its concept record", () => {
    expect(mintCiteUrl({ sandbox: sandboxRec, env: "sandbox" })).toBe(
      "https://sandbox.zenodo.org/records/506411",
    );
  });
  it("(b) a sandbox draft cites its concept record", () => {
    expect(
      mintCiteUrl({
        sandbox: {
          recordId: 700,
          conceptRecId: 699,
          env: "sandbox",
          status: "draft",
        },
        env: "sandbox",
      }),
    ).toBe("https://sandbox.zenodo.org/records/699");
  });
  it("(c) a production draft cites its reserved DOI", () => {
    expect(
      mintCiteUrl({
        prod: {
          recordId: 40,
          conceptDoi: "",
          versionDoi: "10.5281/zenodo.40",
          env: "production",
          status: "draft",
        },
        sandbox: sandboxRec,
        env: "production",
      }),
    ).toBe("https://doi.org/10.5281/zenodo.40");
  });
  it("(d) a published production entry cites its concept DOI", () => {
    expect(mintCiteUrl({ prod: prodRec, env: "production" })).toBe(
      "https://doi.org/10.5281/zenodo.11",
    );
  });
  it("(e) once a production DOI exists, the sandbox deposit cites it too", () => {
    expect(
      mintCiteUrl({ prod: prodRec, sandbox: sandboxRec, env: "sandbox" }),
    ).toBe("https://doi.org/10.5281/zenodo.11");
  });
  it("gives nothing for a new production entry before its reservation", () => {
    expect(
      mintCiteUrl({ sandbox: sandboxRec, env: "production" }),
    ).toBeUndefined();
  });
});
