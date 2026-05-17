import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "./route";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { eq } from "drizzle-orm";

const TOKEN = "test-hottok-123";
const payload = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { name: "Desafio 7 Dias" },
    buyer: {
      name: "João Teste",
      email: "joao@test.com",
      checkout_phone: "+5511999998888",
    },
    purchase: {
      transaction: "HP-TEST-1",
      approved_date: Date.now(),
      price: { value: 197, currency_value: "BRL" },
    },
  },
};

function buildReq(body: unknown, opts: { token?: string | null } = {}) {
  const url = new URL("http://localhost/api/webhooks/hotmart");
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.token !== null) {
    headers.set("x-hotmart-hottok", opts.token ?? TOKEN);
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/hotmart", () => {
  beforeEach(async () => {
    process.env.HOTTOK = TOKEN;
    await db.delete(purchases).where(eq(purchases.transactionId, "HP-TEST-1"));
  });

  it("rejeita 401 sem token", async () => {
    const res = await POST(buildReq(payload, { token: null }));
    expect(res.status).toBe(401);
  });

  it("rejeita 401 com token errado", async () => {
    const res = await POST(buildReq(payload, { token: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("persiste compra approved", async () => {
    const res = await POST(buildReq(payload));
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-TEST-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].productSlug).toBe("desafio");
    expect(rows[0].buyerPhoneE164).toBe("5511999998888");
  });

  it("é idempotente: replay não duplica linha", async () => {
    await POST(buildReq(payload));
    await POST(buildReq(payload));
    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-TEST-1"));
    expect(rows).toHaveLength(1);
  });

  it("atualiza status quando vem REFUNDED depois", async () => {
    await POST(buildReq(payload));
    await POST(buildReq({ ...payload, event: "PURCHASE_REFUNDED" }));
    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-TEST-1"));
    expect(rows[0].status).toBe("refunded");
  });

  it("payload sem transaction_id retorna 400", async () => {
    const bad = {
      event: "PURCHASE_APPROVED",
      data: {
        ...payload.data,
        purchase: { ...payload.data.purchase, transaction: undefined },
      },
    };
    const res = await POST(buildReq(bad));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/webhooks/hotmart", () => {
  it("retorna 200 com status", async () => {
    process.env.HOTTOK = TOKEN;
    const res = await GET();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.service).toBe("hotmart-webhook");
  });
});
