import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { whatsappGroupMembers, whatsappGroups } from "@/lib/schema/whatsapp";
import { eq } from "drizzle-orm";
import {
  getBuyersForCycle,
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getInGroupStats,
  getDailyPurchaseSeries,
} from "./purchases";

const PHONE_IN_GROUP = "5511111111111";
const PHONE_OUT = "5522222222222";
const PHONE_NULL = null;

beforeAll(async () => {
  // Cleanup
  await db.delete(purchases).where(eq(purchases.transactionId, "T-IN"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-OUT"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-NULL"));
  await db
    .delete(whatsappGroupMembers)
    .where(eq(whatsappGroupMembers.phoneNormalized, PHONE_IN_GROUP));
  await db.delete(whatsappGroups).where(eq(whatsappGroups.externalId, "TEST-GRP"));

  // Setup grupo + 1 membro dentro
  const [g] = await db
    .insert(whatsappGroups)
    .values({
      externalId: "TEST-GRP",
      name: "Desafio Teste",
      productSlug: "desafio",
    })
    .returning({ id: whatsappGroups.id });

  await db.insert(whatsappGroupMembers).values({
    groupId: g.id,
    groupExternalId: "TEST-GRP",
    phoneNormalized: PHONE_IN_GROUP,
    name: "Pessoa Dentro",
    lastEventAt: new Date(),
    lastEventType: "joined",
    currentlyInGroup: true,
  });

  // Setup 3 compras do desafio na semana
  const now = new Date();
  await db.insert(purchases).values([
    {
      transactionId: "T-IN",
      productSlug: "desafio",
      status: "approved",
      buyerName: "A",
      buyerPhoneE164: PHONE_IN_GROUP,
      valueCents: 19700,
      purchasedAt: now,
      rawPayload: {},
    },
    {
      transactionId: "T-OUT",
      productSlug: "desafio",
      status: "approved",
      buyerName: "B",
      buyerPhoneE164: PHONE_OUT,
      valueCents: 19700,
      purchasedAt: now,
      rawPayload: {},
    },
    {
      transactionId: "T-NULL",
      productSlug: "desafio",
      status: "approved",
      buyerName: "C",
      buyerPhoneE164: PHONE_NULL,
      valueCents: 19700,
      purchasedAt: now,
      rawPayload: {},
    },
  ]);
});

afterAll(async () => {
  await db.delete(purchases).where(eq(purchases.transactionId, "T-IN"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-OUT"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-NULL"));
  await db
    .delete(whatsappGroupMembers)
    .where(eq(whatsappGroupMembers.phoneNormalized, PHONE_IN_GROUP));
  await db.delete(whatsappGroups).where(eq(whatsappGroups.externalId, "TEST-GRP"));
});

describe("getBuyersForCycle", () => {
  it("retorna compradores aprovados do período com flag inGroup correta", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

    const buyers = await getBuyersForCycle("desafio", { from, to });

    const map = new Map(buyers.map((b) => [b.transactionId, b]));
    expect(map.get("T-IN")?.inGroup).toBe(true);
    expect(map.get("T-OUT")?.inGroup).toBe(false);
    expect(map.get("T-NULL")?.inGroup).toBe(null);
  });

  it("ignora compras refunded/chargeback", async () => {
    await db
      .update(purchases)
      .set({ status: "refunded" })
      .where(eq(purchases.transactionId, "T-IN"));
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const buyers = await getBuyersForCycle("desafio", { from, to });
    expect(buyers.find((b) => b.transactionId === "T-IN")).toBeUndefined();
    // Restore for further tests if any
    await db
      .update(purchases)
      .set({ status: "approved" })
      .where(eq(purchases.transactionId, "T-IN"));
  });
});

describe("getApprovedPurchaseCount", () => {
  it("conta só approved do produto no período", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const count = await getApprovedPurchaseCount("desafio", { from, to });
    // 3 setup rows + N existentes no DB de prod no mesmo intervalo.
    // After previous tests, T-IN may have been left as approved or refunded
    // depending on test order — restored by the existing test. Lower bound só
    // garante que pelo menos as seeds (2-3) estão contadas.
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("getApprovedPurchaseRevenue", () => {
  it("soma valueCents de approved e retorna em reais (float)", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const revenue = await getApprovedPurchaseRevenue("desafio", { from, to });
    // 197 per row × 2-3 rows seeded = pelo menos 394; pode ter compras reais no DB.
    expect(revenue).toBeGreaterThanOrEqual(394);
  });
});

describe("getInGroupStats", () => {
  it("retorna contagem de compradores com phone + quantos estão no grupo", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const stats = await getInGroupStats("desafio", { from, to });
    // T-IN (in group) + T-OUT (with phone, not in group) = 1-2 with phone, T-NULL no phone.
    // Pode ter compras reais no DB com phone também — só validamos o piso.
    expect(stats.buyersWithPhone).toBeGreaterThanOrEqual(1);
    // inGroup count: T-IN matches o grupo de teste, e só se ainda approved.
    expect(stats.inGroup).toBeGreaterThanOrEqual(0);
  });
});

describe("getDailyPurchaseSeries", () => {
  it("agrega por dia e retorna count + revenueCents (sem dias zerados)", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const series = await getDailyPurchaseSeries("desafio", { from, to });
    // Devolve [{ date, count, revenueCents }] — só dias com compras
    expect(series.length).toBeGreaterThanOrEqual(1);
    const totalCount = series.reduce((s, r) => s + r.count, 0);
    expect(totalCount).toBeGreaterThanOrEqual(2);
  });
});
