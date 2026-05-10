import { sql, and, gte, lte, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { adInsightsDaily } from "@/lib/schema/insights";
import { ads, adsets, campaigns, adAccounts, creatives } from "@/lib/schema/meta";
import { detectProduct, getProduct, PRODUCTS, type Product, type ProductSlug } from "@/lib/products";

export interface DateRange {
  /** ISO date YYYY-MM-DD inclusive */
  from: string;
  /** ISO date YYYY-MM-DD inclusive */
  to: string;
}

export interface Kpis {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  purchases: number;
  revenue: number;
  follows: number;
  engagement: number;
  /** Derivados */
  cpm: number; // R$/1000 imp
  ctr: number; // %
  cpl: number; // R$/lead
  cpa: number; // R$/purchase
  roas: number;
  ticket: number;
}

export interface DailyPoint {
  date: string;
  spend: number;
  revenue: number;
  leads: number;
  purchases: number;
  impressions: number;
  clicks: number;
}

export interface ProductBreakdownRow {
  productSlug: ProductSlug | "outros";
  label: string;
  spend: number;
  leads: number;
  purchases: number;
  revenue: number;
  roas: number;
}

export interface AdRow {
  adId: number;
  adName: string;
  campaignName: string;
  thumbnailUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
}

/* ─────────────────────────────────────────────────────────────────────── */

function divSafe(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function productScopeWhere(product: Product): SQL[] {
  const where: SQL[] = [];
  if (product.metaAccountId) {
    where.push(eq(adAccounts.metaAccountId, product.metaAccountId));
  }
  if (product.namePattern) {
    // SQL ILIKE com wildcard derivado da regex (todas regex hoje são literais simples)
    const tokens = extractAlternationTokens(product.namePattern);
    if (tokens.length === 1) {
      where.push(like(sql`upper(${campaigns.name})`, `%${tokens[0].toUpperCase()}%`));
    } else if (tokens.length > 1) {
      where.push(
        or(...tokens.map((t) => like(sql`upper(${campaigns.name})`, `%${t.toUpperCase()}%`)))!,
      );
    }
  }
  return where;
}

/** Extrai alternativas literais de um RegExp. Funciona pros patterns do products.ts. */
function extractAlternationTokens(re: RegExp): string[] {
  const src = re.source;
  // remove flags-irrelevant chars; só nos importam alternâncias literais
  // ex.: "PERPETUO-SONO|PROTOCOLO.*SONO" → ["PERPETUO-SONO", "PROTOCOLO.*SONO"]
  const parts = src.split("|").map((p) => p.replace(/^\\/, "").replace(/\$$/, ""));
  // pega só a parte literal antes do primeiro metachar
  return parts.map((p) => p.replace(/[.*+?(){}[\]\\^$|]/g, " ").trim()).filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────────────── */

export async function getKpis(slug: ProductSlug, range: DateRange): Promise<Kpis> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const [row] = await db
    .select({
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      reach: sql<number>`coalesce(sum(${adInsightsDaily.reach})::int, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
      follows: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'follow')::float), 0)`,
      engagement: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'engagement')::float), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds));

  const spend = Number(row?.spend ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  const clicks = Number(row?.clicks ?? 0);
  const leads = Number(row?.leads ?? 0);
  const purchases = Number(row?.purchases ?? 0);
  const revenue = Number(row?.revenue ?? 0);

  return {
    spend,
    impressions,
    clicks,
    reach: Number(row?.reach ?? 0),
    leads,
    purchases,
    revenue,
    follows: Number(row?.follows ?? 0),
    engagement: Number(row?.engagement ?? 0),
    cpm: divSafe(spend, impressions) * 1000,
    ctr: divSafe(clicks, impressions) * 100,
    cpl: divSafe(spend, leads),
    cpa: divSafe(spend, purchases),
    roas: divSafe(revenue, spend),
    ticket: divSafe(revenue, purchases),
  };
}

export async function getDailySeries(slug: ProductSlug, range: DateRange): Promise<DailyPoint[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const rows = await db
    .select({
      date: adInsightsDaily.date,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(adInsightsDaily.date)
    .orderBy(adInsightsDaily.date);

  return rows.map((r) => ({
    date: r.date,
    spend: Number(r.spend),
    revenue: Number(r.revenue),
    leads: Number(r.leads),
    purchases: Number(r.purchases),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
  }));
}

/**
 * Para o dash Geral: agrupa o gasto/receita por produto detectado.
 * Faz uma única query de campanhas + insights e classifica em memória.
 */
export async function getProductBreakdown(range: DateRange): Promise<ProductBreakdownRow[]> {
  const rows = await db
    .select({
      campaignName: campaigns.name,
      metaAccountId: adAccounts.metaAccountId,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(gte(adInsightsDaily.date, range.from), lte(adInsightsDaily.date, range.to)))
    .groupBy(campaigns.name, adAccounts.metaAccountId);

  const buckets = new Map<string, ProductBreakdownRow>();
  const labelOf = (slug: ProductSlug | "outros") =>
    slug === "outros"
      ? "Outros"
      : PRODUCTS.find((p) => p.slug === slug)?.shortLabel ?? slug;

  for (const r of rows) {
    const slug = detectProduct(r.campaignName, r.metaAccountId);
    if (slug === "geral") continue;
    const cur =
      buckets.get(slug) ??
      ({
        productSlug: slug,
        label: labelOf(slug),
        spend: 0,
        leads: 0,
        purchases: 0,
        revenue: 0,
        roas: 0,
      } as ProductBreakdownRow);
    cur.spend += Number(r.spend);
    cur.leads += Number(r.leads);
    cur.purchases += Number(r.purchases);
    cur.revenue += Number(r.revenue);
    buckets.set(slug, cur);
  }
  for (const v of buckets.values()) v.roas = divSafe(v.revenue, v.spend);
  return [...buckets.values()].sort((a, b) => b.spend - a.spend);
}

/**
 * Para o dash Desafio: retorna pontos diários nas últimas N semanas + a corrente.
 * Cada ponto traz o offset (1=Seg, 7=Dom) pra plotar com eixo X = dia da semana.
 */
export interface WeeklyOverlayPoint {
  weekStart: string; // segunda da semana (YYYY-MM-DD)
  weekLabel: string; // "Esta semana" | "Sem -1" | etc
  dayOfWeek: number; // 1..7 (seg..dom)
  date: string;
  spend: number;
  revenue: number;
  purchases: number;
  leads: number;
}

export async function getWeeklyOverlay(
  slug: ProductSlug,
  weeks: number,
): Promise<WeeklyOverlayPoint[]> {
  // Calcula segunda corrente em horário SP
  const today = new Date();
  const dow = ((today.getDay() + 6) % 7); // dom=0 -> 6, seg=1 -> 0, …
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  monday.setHours(0, 0, 0, 0);

  const start = new Date(monday);
  start.setDate(monday.getDate() - 7 * (weeks - 1));
  const range = {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };

  const series = await getDailySeries(slug, range);

  return series.map((p) => {
    const d = new Date(p.date + "T00:00:00");
    const dDow = ((d.getDay() + 6) % 7) + 1; // 1..7
    const wMonday = new Date(d);
    wMonday.setDate(d.getDate() - (dDow - 1));
    const weekStart = wMonday.toISOString().slice(0, 10);
    const weeksAgo = Math.round(
      (monday.getTime() - wMonday.getTime()) / (7 * 24 * 3600 * 1000),
    );
    const weekLabel =
      weeksAgo === 0 ? "Esta semana" : weeksAgo === 1 ? "Semana passada" : `${weeksAgo} sem atrás`;
    return {
      weekStart,
      weekLabel,
      dayOfWeek: dDow,
      date: p.date,
      spend: p.spend,
      revenue: p.revenue,
      purchases: p.purchases,
      leads: p.leads,
    };
  });
}

/** Top ads do produto, ordenado por critério. Usado nas tabelas dos dashes. */
export async function getTopAds(
  slug: ProductSlug,
  range: DateRange,
  opts: { limit?: number; orderBy?: "roas" | "spend" | "purchases" } = {},
): Promise<AdRow[]> {
  const limit = opts.limit ?? 50;
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const rows = await db
    .select({
      adId: ads.id,
      adName: ads.name,
      campaignName: campaigns.name,
      thumbnailUrl: creatives.thumbnailUrl,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(ads.id, ads.name, campaigns.name, creatives.thumbnailUrl);

  const enriched: AdRow[] = rows.map((r) => {
    const spend = Number(r.spend);
    const purchases = Number(r.purchases);
    const revenue = Number(r.revenue);
    return {
      adId: r.adId,
      adName: r.adName,
      campaignName: r.campaignName,
      thumbnailUrl: r.thumbnailUrl,
      spend,
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      leads: Number(r.leads),
      purchases,
      revenue,
      roas: divSafe(revenue, spend),
      cpa: divSafe(spend, purchases),
    };
  });

  const orderBy = opts.orderBy ?? "spend";
  enriched.sort((a, b) => (b[orderBy] as number) - (a[orderBy] as number));
  return enriched.slice(0, limit);
}

/* ─────────────────────────────────────────────────────────────────────── */
// Helpers de range de datas (timezone SP simplificado)

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function rangeLastDays(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function rangePreviousPeriod(range: DateRange): DateRange {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T00:00:00");
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(from.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevTo.getDate() - (days - 1));
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

export function rangeCurrentWeek(): DateRange {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  return {
    from: monday.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}
