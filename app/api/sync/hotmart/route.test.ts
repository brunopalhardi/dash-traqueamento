import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "./route";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { syncJobs } from "@/lib/schema/sync";
import { eq } from "drizzle-orm";
import { invalidateAccessTokenCache } from "@/lib/hotmart/oauth";

const CRON = "test-cron-secret";

const sampleItem = {
  product: { id: 7523998, name: "Desafio O Bom do Alzheimer" },
  buyer: {
    name: "João Histórico",
    email: "joao-hist@test.com",
    checkout_phone: "+5511999991111",
  },
  purchase: {
    transaction: "HP-SYNC-1",
    status: "APPROVED",
    approved_date: Date.now(),
    price: { value: 197, currency_value: "BRL" },
  },
};

const tokenRes = () =>
  new Response(JSON.stringify({ access_token: "tk", expires_in: 86400 }), { status: 200 });
const pageRes = (items: unknown[]) =>
  new Response(
    JSON.stringify({ items, page_info: { next_page_token: null } }),
    { status: 200 },
  );

function buildReq({ days, token }: { days?: number; token?: string | null } = {}) {
  const u = new URL("http://localhost/api/sync/hotmart");
  if (days != null) u.searchParams.set("days", String(days));
  const headers = new Headers();
  if (token !== null) headers.set("authorization", `Bearer ${token ?? CRON}`);
  return new NextRequest(u, { method: "POST", headers });
}

beforeEach(async () => {
  process.env.CRON_SECRET = CRON;
  process.env.HOTMART_CLIENT_ID = "id";
  process.env.HOTMART_CLIENT_SECRET = "secret";
  invalidateAccessTokenCache();
  vi.restoreAllMocks();
  await db.delete(purchases).where(eq(purchases.transactionId, "HP-SYNC-1"));
  await db.delete(purchases).where(eq(purchases.transactionId, "HP-EXP"));
  await db.delete(syncJobs).where(eq(syncJobs.type, "hotmart_replay"));
});

describe("POST /api/sync/hotmart", () => {
  it("401 sem CRON_SECRET", async () => {
    const res = await POST(buildReq({ token: null }));
    expect(res.status).toBe(401);
  });

  it("401 com token errado", async () => {
    const res = await POST(buildReq({ token: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("200 + stats com 1 item approved persistido", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([sampleItem]));

    const res = await POST(buildReq({ days: 7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { processed: number; upserted: number; skipped: number };
    expect(json.processed).toBe(1);
    expect(json.upserted).toBe(1);
    expect(json.skipped).toBe(0);

    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-SYNC-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].productSlug).toBe("desafio");
  });

  it("idempotente: 2 runs sequenciais não duplicam linha", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([sampleItem]))
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([sampleItem]));

    await POST(buildReq({ days: 7 }));
    invalidateAccessTokenCache();
    await POST(buildReq({ days: 7 }));

    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-SYNC-1"));
    expect(rows).toHaveLength(1);
  });

  it("items com status não suportado contam como skipped", async () => {
    const expired = { ...sampleItem, purchase: { ...sampleItem.purchase, status: "EXPIRED", transaction: "HP-EXP" } };
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([expired]));

    const res = await POST(buildReq({ days: 7 }));
    const json = (await res.json()) as { skipped: number; upserted: number };
    expect(json.upserted).toBe(0);
    expect(json.skipped).toBe(1);
  });

  it("default days=1 quando query string ausente", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([]));
    const res = await POST(buildReq({}));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { startDate: string; endDate: string };
    const span = new Date(json.endDate).getTime() - new Date(json.startDate).getTime();
    // 1 dia + 2h overlap = 26h, com tolerância de 1min
    expect(span).toBeGreaterThanOrEqual(26 * 3_600_000 - 60_000);
    expect(span).toBeLessThanOrEqual(26 * 3_600_000 + 60_000);
  });

  it("clampa days a 365 (proteção contra timeout)", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([]));
    const res = await POST(buildReq({ days: 999 }));
    const json = (await res.json()) as { startDate: string; endDate: string };
    const span = new Date(json.endDate).getTime() - new Date(json.startDate).getTime();
    // 365 dias + 2h overlap
    expect(span).toBeLessThanOrEqual(365 * 86_400_000 + 2 * 3_600_000 + 60_000);
  });
});

describe("GET /api/sync/hotmart", () => {
  // GET é alias do POST (Vercel Cron dispara via GET com Authorization).
  it("401 sem CRON_SECRET (alias do POST)", async () => {
    const req = new NextRequest(new URL("http://localhost/api/sync/hotmart"));
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("200 com Bearer CRON_SECRET", async () => {
    vi.spyOn(global, "fetch")
      .mockImplementationOnce(async () => tokenRes())
      .mockImplementationOnce(async () => pageRes([]));
    const u = new URL("http://localhost/api/sync/hotmart");
    const headers = new Headers({ authorization: `Bearer ${CRON}` });
    const req = new NextRequest(u, { method: "GET", headers });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
