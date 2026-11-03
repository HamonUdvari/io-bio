import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_AGENT, createZenodoClient } from "./zenodo-client.ts";

describe("zenodo-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names its client in every request (zenodo.org blocks Node's default User-Agent)", async () => {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        seen.push(init.headers);
        return new Response(
          JSON.stringify({ id: 7, links: {}, metadata: {} }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );
    const zen = createZenodoClient({
      baseUrl: "https://zenodo.org/api",
      token: "t",
      minIntervalMs: 0,
    });
    await zen.getDeposition(7);
    await zen.createDeposition({});
    await zen.uploadFile(
      "https://zenodo.org/api/files/b",
      "x.pdf",
      Buffer.from("x"),
    );
    expect(seen).toHaveLength(3);
    for (const h of seen) {
      expect(h["User-Agent"]).toBe(USER_AGENT);
      expect(h["User-Agent"]).not.toMatch(/^node/);
      expect(h.Authorization).toBe("Bearer t");
    }
  });
});
