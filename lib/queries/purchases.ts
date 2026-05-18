import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { whatsappGroupMembers } from "@/lib/schema/whatsapp";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

export interface BuyerRow {
  transactionId: string;
  purchasedAt: Date;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneE164: string | null;
  valueCents: number | null;
  /** true se está em algum grupo agora, false se está mas saiu, null se telefone faltou */
  inGroup: boolean | null;
}

/**
 * Retorna compradores aprovados de um produto dentro de um período.
 * Faz LEFT JOIN com whatsapp_group_members.phone_normalized pra resolver inGroup.
 * Se buyer_phone_e164 for null, inGroup = null (não rotula como "fora").
 */
export async function getBuyersForCycle(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<BuyerRow[]> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");

  const rows = await db
    .select({
      transactionId: purchases.transactionId,
      purchasedAt: purchases.purchasedAt,
      buyerName: purchases.buyerName,
      buyerEmail: purchases.buyerEmail,
      buyerPhoneE164: purchases.buyerPhoneE164,
      valueCents: purchases.valueCents,
      inGroupAny: sql<boolean | null>`
        case
          when ${purchases.buyerPhoneE164} is null then null
          else exists(
            select 1 from ${whatsappGroupMembers}
            where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
              and ${whatsappGroupMembers.currentlyInGroup} = true
          )
        end
      `,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    )
    .orderBy(sql`${purchases.purchasedAt} desc`);

  return rows.map((r) => ({
    transactionId: r.transactionId,
    purchasedAt: r.purchasedAt,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhoneE164: r.buyerPhoneE164,
    valueCents: r.valueCents,
    inGroup: r.inGroupAny,
  }));
}

/**
 * Conta compras aprovadas de um produto no período.
 */
export async function getApprovedPurchaseCount(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<number> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Soma de value_cents (em reais) de compras aprovadas no período.
 */
export async function getApprovedPurchaseRevenue(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<number> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const [row] = await db
    .select({
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    );
  return Number(row?.cents ?? 0) / 100;
}

export interface InGroupStats {
  buyersWithPhone: number;
  inGroup: number;
}

/**
 * Quantos compradores aprovados estão atualmente no grupo WhatsApp.
 * Match via phoneNormalized = buyer_phone_e164.
 */
export async function getInGroupStats(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<InGroupStats> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const [row] = await db
    .select({
      withPhone: sql<number>`count(*) filter (where ${purchases.buyerPhoneE164} is not null)::int`,
      inGroup: sql<number>`count(*) filter (where exists(
        select 1 from ${whatsappGroupMembers}
        where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
          and ${whatsappGroupMembers.currentlyInGroup} = true
      ))::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    );
  return {
    buyersWithPhone: Number(row?.withPhone ?? 0),
    inGroup: Number(row?.inGroup ?? 0),
  };
}

export interface DailyPurchasePoint {
  date: string;
  count: number;
  revenueCents: number;
}

/**
 * Série diária de compras aprovadas pra alimentar gráfico de barras.
 * Datas no fuso America/Sao_Paulo. Só retorna dias com compras (caller preenche zeros).
 */
export async function getDailyPurchaseSeries(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<DailyPurchasePoint[]> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const rows = await db
    .select({
      date: sql<string>`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenueCents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    )
    .groupBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    );
  return rows.map((r) => ({
    date: r.date,
    count: Number(r.count),
    revenueCents: Number(r.revenueCents),
  }));
}
