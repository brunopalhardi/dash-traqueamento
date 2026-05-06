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

describe("metaClient.getAdAccounts pagination", () => {
  it("follows paging.next", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: async () => ({
          data: [{ id: "act_1", account_id: "1", name: "A", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 }],
          paging: { next: "https://graph.facebook.com/v21.0/me/adaccounts?after=X" },
        }),
      },
      {
        ok: true,
        json: async () => ({
          data: [{ id: "act_2", account_id: "2", name: "B", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 }],
        }),
      },
    ]);
    const client = createMetaClient({ token: "T", graphVersion: "v21.0" });
    const accounts = await client.getAdAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0].id).toBe("act_1");
    expect(accounts[1].id).toBe("act_2");
  });
});

describe("metaClient retry on rate limit", () => {
  it("retries on 429 and succeeds", async () => {
    mockFetchSequence([
      { ok: false, status: 429, json: async () => ({ error: { code: 17, message: "User request limit reached" } }) },
      { ok: true, json: async () => ({ id: "1", name: "Bruno" }) },
    ]);
    const sleep = vi.fn(async () => {});
    const client = createMetaClient({ token: "T", graphVersion: "v21.0", sleep });
    const me = await client.getMe();
    expect(me.id).toBe("1");
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("throws MetaRateLimitError after 4 retries", async () => {
    mockFetchSequence(
      Array.from({ length: 5 }, () => ({
        ok: false as const,
        status: 429,
        json: async () => ({ error: { code: 17, message: "rate limit" } }),
      })),
    );
    const sleep = vi.fn(async () => {});
    const client = createMetaClient({ token: "T", graphVersion: "v21.0", sleep });
    await expect(client.getMe()).rejects.toBeInstanceOf(MetaRateLimitError);
    expect(sleep).toHaveBeenCalledTimes(4);
  });
});

describe("metaClient auth errors", () => {
  it("throws MetaAuthError on code 190 without retry", async () => {
    mockFetchSequence([
      { ok: false, status: 401, json: async () => ({ error: { code: 190, message: "Invalid OAuth access token" } }) },
    ]);
    const sleep = vi.fn(async () => {});
    const client = createMetaClient({ token: "BAD", graphVersion: "v21.0", sleep });
    await expect(client.getMe()).rejects.toBeInstanceOf(MetaAuthError);
    expect(sleep).not.toHaveBeenCalled();
  });
});
