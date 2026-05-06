import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMetaClient } from "./client";
import { MetaAuthError, MetaRateLimitError } from "./errors";

const originalFetch = global.fetch;

function mockFetchSequence(responses: Array<Partial<Response> & { json: () => Promise<unknown> }>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("fetch called more times than mocked");
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: new Headers(r.headers as HeadersInit),
      json: r.json,
    } as Response;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

describe("metaClient.getMe", () => {
  it("returns user identity", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ id: "1", name: "Bruno" }) },
    ]);
    const client = createMetaClient({ token: "T", graphVersion: "v21.0" });
    const me = await client.getMe();
    expect(me).toEqual({ id: "1", name: "Bruno" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/me?fields=id%2Cname",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer T" }),
      }),
    );
  });
});
