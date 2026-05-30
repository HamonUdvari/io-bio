// Thin typed wrapper over the Zenodo Deposit REST API with sequential
// throttling + exponential backoff. Uses Node's global fetch (Node >= 18).
// Factory-function style (no classes) to stay simple under Node's native TS.

export interface ZenodoClientOptions {
  baseUrl: string; // e.g. https://sandbox.zenodo.org/api
  token: string;
  minIntervalMs?: number; // min spacing between requests (default 700ms)
  maxRetries?: number; // on 429/5xx (default 5)
}

export interface Deposition {
  id: number;
  links: { bucket?: string; publish?: string; self?: string; [k: string]: any };
  metadata: { prereserve_doi?: { doi: string; recid: number }; [k: string]: any };
  conceptdoi?: string;
  conceptrecid?: number;
  doi?: string;
  [k: string]: any;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createZenodoClient(opts: ZenodoClientOptions) {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const minInterval = opts.minIntervalMs ?? 700;
  const maxRetries = opts.maxRetries ?? 5;
  let lastReqAt = 0;

  async function throttle() {
    const wait = lastReqAt + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastReqAt = Date.now();
  }

  interface ReqOpts {
    json?: unknown;
    body?: Buffer | Uint8Array;
    headers?: Record<string, string>;
    absolute?: boolean; // url is absolute (e.g. a bucket link), don't prefix baseUrl
  }

  async function request(method: string, url: string, o: ReqOpts = {}): Promise<any> {
    const target = o.absolute ? url : `${baseUrl}${url}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.token}`,
      ...(o.headers ?? {}),
    };
    let payload: BodyInit | undefined;
    if (o.json !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(o.json);
    } else if (o.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/octet-stream";
      payload = o.body as any;
    }

    // Only GET/PUT are safe to auto-retry on a network error or 5xx: a lost
    // response to a non-idempotent POST (create/publish/newversion) may mean
    // the write actually succeeded server-side, so retrying could mint a
    // DUPLICATE permanent DOI. 429 is a pre-processing rate-limit rejection
    // (the request wasn't executed), so it's safe to retry for any method.
    const idempotent = method === "GET" || method === "PUT";
    let attempt = 0;
    for (;;) {
      await throttle();
      let res: Response;
      try {
        res = await fetch(target, { method, headers, body: payload });
      } catch (err) {
        if (idempotent && attempt++ < maxRetries) {
          await sleep(Math.min(30_000, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`${method} ${target} network error: ${(err as Error).message}`);
      }

      const retryable = res.status === 429 || (res.status >= 500 && idempotent);
      if (retryable) {
        if (attempt++ < maxRetries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(30_000, 1000 * 2 ** attempt);
          await sleep(backoff);
          continue;
        }
      }

      const text = await res.text();
      const data = text ? safeJson(text) : null;
      if (!res.ok) {
        throw new Error(
          `${method} ${target} → ${res.status} ${res.statusText}: ${
            typeof data === "object" ? JSON.stringify(data) : text
          }`,
        );
      }
      return data;
    }
  }

  function safeJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    /** Create a draft. Pass prereserve to get the version DOI before publishing. */
    createDeposition: (metadata?: Record<string, any>): Promise<Deposition> =>
      request("POST", "/deposit/depositions", {
        json: metadata ? { metadata } : {},
      }),

    getDeposition: (id: number): Promise<Deposition> =>
      request("GET", `/deposit/depositions/${id}`),

    /** Upload a file to the deposition's bucket (new files API). */
    uploadFile: (bucketUrl: string, filename: string, bytes: Buffer): Promise<any> =>
      request("PUT", `${bucketUrl}/${encodeURIComponent(filename)}`, {
        body: bytes,
        absolute: true,
      }),

    updateMetadata: (id: number, metadata: Record<string, any>): Promise<Deposition> =>
      request("PUT", `/deposit/depositions/${id}`, { json: { metadata } }),

    publish: (id: number): Promise<Deposition> =>
      request("POST", `/deposit/depositions/${id}/actions/publish`),

    /** Start a new version draft of a published record. */
    newVersion: (id: number): Promise<Deposition> =>
      request("POST", `/deposit/depositions/${id}/actions/newversion`),

    /** Discard an unpublished draft (clears a dangling new-version draft). */
    discard: (id: number): Promise<any> =>
      request("POST", `/deposit/depositions/${id}/actions/discard`),
  };
}

export type ZenodoClient = ReturnType<typeof createZenodoClient>;
