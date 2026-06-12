import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import {
  whatsappGroupEvents,
  whatsappGroupMembers,
  whatsappGroups,
} from "@/lib/schema/whatsapp";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

const TZ = "America/Sao_Paulo";

/**
 * Filtra purchased_at pelo dia-calendário em fuso BR (America/Sao_Paulo).
 *
 * `purchased_at` é timestamptz (instante UTC). Comparar contra `new Date(...)`
 * sem fuso usava o fuso local do processo — na Vercel (UTC) isso jogava compras
 * da madrugada UTC (= noite do dia anterior em BR) pro dia seguinte. Aqui a
 * gente converte o instante pro relógio de parede BR e compara a data, igual ao
 * bucketing diário de `getDailyPurchaseSeries`. Resultado independe do fuso do
 * processo.
 */
function inRangeBR(range: DateRange) {
  return sql`(${purchases.purchasedAt} at time zone ${TZ})::date between ${range.from}::date and ${range.to}::date`;
}

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
        inRangeBR(range),
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
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
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
  const [row] = await db
    .select({
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    );
  return Number(row?.cents ?? 0) / 100;
}

export interface RevenueSplit {
  trafego: number;
  organico: number;
  semAtribuicao: number;
}

/** Receita aprovada (R$) por balde de atribuição no período (fuso BR). */
export async function getRevenueSplit(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<RevenueSplit> {
  const rows = await db
    .select({
      bucket: purchases.trafficSource,
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    )
    .groupBy(purchases.trafficSource);

  const out: RevenueSplit = { trafego: 0, organico: 0, semAtribuicao: 0 };
  for (const r of rows) {
    const reais = Number(r.cents) / 100;
    if (r.bucket === "trafego") out.trafego += reais;
    else if (r.bucket === "organico") out.organico += reais;
    else out.semAtribuicao += reais; // null (pré-backfill) também cai aqui
  }
  return out;
}

/** Receita Hotmart aprovada por NOME de campanha (match do c= do sck), upper-cased. */
export async function getRevenueByCampaignName(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      campaign: sql<string>`upper(${purchases.utmCampaign})`,
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        eq(purchases.trafficSource, "trafego"),
        sql`${purchases.utmCampaign} is not null`,
        inRangeBR(range),
      ),
    )
    .groupBy(sql`upper(${purchases.utmCampaign})`);
  return new Map(rows.map((r) => [r.campaign, Number(r.cents) / 100]));
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
        inRangeBR(range),
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
        inRangeBR(range),
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

export interface BuyerPurchaseEntry {
  transactionId: string;
  productSlug: string;
  productNameRaw: string | null;
  status: string;
  valueCents: number | null;
  purchasedAt: Date;
}

export interface BuyerGroupEvent {
  groupName: string | null;
  eventType: "joined" | "left" | "unknown";
  occurredAt: Date;
}

export interface BuyerJourney {
  purchases: BuyerPurchaseEntry[];
  whatsappEvents: BuyerGroupEvent[];
}

/**
 * Histórico completo de um comprador identificado por email OU phone.
 * Casa por OR — se ambos vierem, busca em qualquer um. Sem identifier → vazio.
 */
export async function getBuyerJourney(
  identifier: { email?: string | null; phone?: string | null },
): Promise<BuyerJourney> {
  const email = identifier.email?.trim() || null;
  const phone = identifier.phone?.trim() || null;
  if (!email && !phone) return { purchases: [], whatsappEvents: [] };

  const purchaseConds = [];
  if (email) purchaseConds.push(eq(purchases.buyerEmail, email));
  if (phone) purchaseConds.push(eq(purchases.buyerPhoneE164, phone));
  const purchaseWhere =
    purchaseConds.length === 1
      ? purchaseConds[0]
      : sql`(${sql.join(purchaseConds, sql` OR `)})`;

  const purchaseRows = await db
    .select({
      transactionId: purchases.transactionId,
      productSlug: purchases.productSlug,
      productNameRaw: purchases.productNameRaw,
      status: purchases.status,
      valueCents: purchases.valueCents,
      purchasedAt: purchases.purchasedAt,
    })
    .from(purchases)
    .where(purchaseWhere)
    .orderBy(sql`${purchases.purchasedAt} desc`);

  // Eventos de grupo só por phone (sendflow não rastreia email)
  let eventRows: { groupName: string | null; eventType: "joined" | "left" | "unknown"; occurredAt: Date }[] = [];
  if (phone) {
    eventRows = await db
      .select({
        groupName: whatsappGroups.name,
        eventType: whatsappGroupEvents.eventType,
        occurredAt: whatsappGroupEvents.occurredAt,
      })
      .from(whatsappGroupEvents)
      .leftJoin(
        whatsappGroups,
        eq(whatsappGroupEvents.groupExternalId, whatsappGroups.externalId),
      )
      .where(eq(whatsappGroupEvents.phoneNormalized, phone))
      .orderBy(sql`${whatsappGroupEvents.occurredAt} desc`);
  }

  return {
    purchases: purchaseRows.map((p) => ({
      transactionId: p.transactionId,
      productSlug: p.productSlug,
      productNameRaw: p.productNameRaw,
      status: p.status,
      valueCents: p.valueCents,
      purchasedAt: p.purchasedAt,
    })),
    whatsappEvents: eventRows.map((e) => ({
      groupName: e.groupName,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
    })),
  };
}
