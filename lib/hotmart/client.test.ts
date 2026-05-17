import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchSalesHistory } from "./client";
import { invalidateAccessTokenCache } from "./oauth";

const TOKEN_RESPONSE = () =>
  new Response(JSON.stringify({ access_token: "tk-1", expires_in: 86400 }), { status: 200 });

function pageResponse(items: unknown[], nextPageToken: string | null = null) {
  return new Response(
    JSON.stringify({ items, page_info: { next_page_token: nextPageToken } }),
    { status: 200 },
  );
}

beforeEach(() => {
  invalidateAccessTokenCache();
  process.env.HOTMART_CLIENT_ID = "id";
  process.env.HOTMART_CLIENT_SECRET = "secret";
  vi.restoreAllMocks();
});

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe("fetchSalesHistory", () => {
  it("retorna lista vazia quando sem itens", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => TOKEN_RESPONSE())
      .mockImplementationOnce(async () => pageResponse([]));
    const items = await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    expect(items).toEqual([]);
  });

  it("itera 2 páginas e retorna 5 itens no total", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => TOKEN_RESPONSE())
      .mockImplementationOnce(async () => pageResponse([{ id: 1 }, { id: 2 }, { id: 3 }], "tok-2"))
      .mockImplementationOnce(async () => pageResponse([{ id: 4 }, { id: 5 }]));
    const items = await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    expect(items.map((i: { id: number }) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("envia start_date e end_date como epoch ms e Bearer token", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementationOnce(async () => TOKEN_RESPONSE())
      .mockImplementationOnce(async () => pageResponse([]));
    await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    // call 0 é o OAuth; call 1 é a sales-history
    const [url, init] = fetchSpy.mock.calls[1];
    expect(String(url)).toContain("developers.hotmart.com/payments/api/v1/sales/history");
    expect(String(url)).toContain(`start_date=${new Date("2026-05-01T00:00:00Z").getTime()}`);
    expect(String(url)).toContain(`end_date=${new Date("2026-05-17T00:00:00Z").getTime()}`);
    expect(String(url)).toContain("max_results=100");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tk-1");
  });

  it("dá uma retentativa quando o primeiro request retorna 401 (token expirou)", async () => {
    // OAuth #1 → sales 401 → OAuth #2 (forçado) → sales 200
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => TOKEN_RESPONSE())
      .mockImplementationOnce(async () => new Response("unauthorized", { status: 401 }))
      .mockImplementationOnce(
        async () => new Response(JSON.stringify({ access_token: "tk-2", expires_in: 86400 }), { status: 200 }),
      )
      .mockImplementationOnce(async () => pageResponse([{ id: 99 }]));
    const items = await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    expect(items).toEqual([{ id: 99 }]);
  });

  it("lança erro em status não-200 que não seja 401", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => TOKEN_RESPONSE())
      .mockImplementationOnce(async () => new Response("server error", { status: 500 }));
    const iter = fetchSalesHistory({
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-05-17T00:00:00Z"),
    });
    await expect(collect(iter)).rejects.toThrow(/hotmart sales-history.*500.*server error/);
  });
});
