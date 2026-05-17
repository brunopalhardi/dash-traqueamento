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
    if (slug === "geral" || slug === "outros") continue;
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
 * Para o dash Desafio: retorna pontos diários nos últimos N ciclos + o atual.
 * O ciclo é uma janela deslizante de `cycleDays` dias terminando em "today".
 *
 * `dayInCycle` (1..cycleDays) é o offset dentro do ciclo, usado como eixo X
 * do overlay chart. Cada ciclo vira uma linha sobreposta.
 */
export interface CycleOverlayPoint {
  cycleStart: string; // YYYY-MM-DD do primeiro dia do ciclo
  cycleEnd: string;
  cycleLabel: string; // "Ciclo atual" | "Ciclo -1" | …
  cycleOffset: number; // 0=atual, 1=passado, 2=retrasado…
  dayInCycle: number; // 1..cycleDays
  date: string;
  spend: number;
  revenue: number;
  purchases: number;
  leads: number;
}

function dateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Range "ciclo atual" = últimos `cycleDays` dias terminando hoje.
 * Se `customStart`+`customEnd` forem passados, ignora cycleDays e usa o intervalo direto.
 */
export function rangeCurrentCycle(
  cycleDays: number,
  custom?: { start: string; end: string },
): DateRange {
  if (custom) return { from: custom.start, to: custom.end };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = addDays(today, -(cycleDays - 1));
  return { from: dateISO(from), to: dateISO(today) };
}

/** Range do ciclo anterior (de mesmo tamanho) ao atual. */
export function rangePreviousCycle(currentRange: DateRange): DateRange {
  const fromCurr = new Date(currentRange.from + "T00:00:00");
  const toCurr = new Date(currentRange.to + "T00:00:00");
  const days = Math.round((toCurr.getTime() - fromCurr.getTime()) / 86400000) + 1;
  const prevTo = addDays(fromCurr, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from: dateISO(prevFrom), to: dateISO(prevTo) };
}

/**
 * Overlay de até `cyclesBack` ciclos passados + o atual.
 *
 * - Quando `customStart/customEnd` é passado, o ciclo atual = esse intervalo
 *   e o tamanho do ciclo é derivado dele.
 * - Cycles anteriores são gerados deslocando a janela atual `cycleDays` dias
 *   pra trás, sucessivamente.
 */
export async function getCycleOverlay(
  slug: ProductSlug,
  opts: {
    cycleDays?: number;
    cyclesBack?: number;
    custom?: { start: string; end: string };
  },
): Promise<CycleOverlayPoint[]> {
  const customDays = opts.custom
    ? Math.round(
        (new Date(opts.custom.end + "T00:00:00").getTime() -
          new Date(opts.custom.start + "T00:00:00").getTime()) /
          86400000,
      ) + 1
    : null;
  const cycleDays = customDays ?? opts.cycleDays ?? 7;
  const cyclesBack = opts.cyclesBack ?? 4;

  const current = rangeCurrentCycle(cycleDays, opts.custom);

  // Range total: do início do ciclo mais antigo até o fim do ciclo atual
  const oldestStart = addDays(
    new Date(current.from + "T00:00:00"),
    -cycleDays * cyclesBack,
  );
  const fullRange: DateRange = {
    from: dateISO(oldestStart),
    to: current.to,
  };

  const series = await getDailySeries(slug, fullRange);
  const currentStart = new Date(current.from + "T00:00:00");

  return series.map((p) => {
    const d = new Date(p.date + "T00:00:00");
    const diffDays = Math.floor((currentStart.getTime() - d.getTime()) / 86400000);
    // ciclo 0 = atual; ciclo 1 = anterior; …
    const cycleOffset = diffDays < 0 ? 0 : Math.floor(diffDays / cycleDays) + (diffDays % cycleDays === 0 ? 0 : 0);
    // Calcula início do ciclo do ponto
    const cycleStart = addDays(currentStart, -cycleOffset * cycleDays);
    const cycleEnd = addDays(cycleStart, cycleDays - 1);
    const dayInCycle =
      Math.floor((d.getTime() - cycleStart.getTime()) / 86400000) + 1;

    const cycleLabel =
      cycleOffset === 0
        ? "Ciclo atual"
        : cycleOffset === 1
          ? "Ciclo passado"
          : `Ciclo -${cycleOffset}`;

    return {
      cycleStart: dateISO(cycleStart),
      cycleEnd: dateISO(cycleEnd),
      cycleLabel,
      cycleOffset,
      dayInCycle,
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

/* ─────────────────────────────────────────────────────────────────────── */
/* Fase 2 — Painéis avançados (funil, qualidade, hierarquia)               */
/* ─────────────────────────────────────────────────────────────────────── */

export interface FunnelMetrics {
  impressions: number;
  clicks: number;
  purchases: number;
  cpm: number;
  ctr: number; // %
  /** Tx. de conversão de clique → compra (purchases / clicks) */
  conversionRate: number; // %
  /** Tx. de conversão de impressão → compra (purchases / impressions) */
  impressionToPurchase: number; // %
  spend: number;
}

export async function getFunnelMetrics(
  slug: ProductSlug,
  range: DateRange,
): Promise<FunnelMetrics> {
  const k = await getKpis(slug, range);
  return {
    impressions: k.impressions,
    clicks: k.clicks,
    purchases: k.purchases,
    cpm: k.cpm,
    ctr: k.ctr,
    conversionRate: divSafe(k.purchases, k.clicks) * 100,
    impressionToPurchase: divSafe(k.purchases, k.impressions) * 100,
    spend: k.spend,
  };
}

export type HierarchyLevel = "campaign" | "adset" | "ad";

export interface HierarchyRow {
  id: number;
  name: string;
  status: string;
  /** Orçamento diário do nível (campaign ou adset) — null pra ad ou quando não há */
  dailyBudget: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  cpa: number;
  cpl: number;
  ctr: number;
  roas: number;
  profit: number; // revenue - spend
  thumbnailUrl: string | null; // só pra level=ad
}

export async function getHierarchyTable(
  slug: ProductSlug,
  range: DateRange,
  level: HierarchyLevel,
): Promise<HierarchyRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const insightsExpr = {
    spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
    impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
    clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
    leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
    purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
    revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
  };

  let rows: Array<Omit<HierarchyRow, "cpa" | "cpl" | "ctr" | "roas" | "profit">> = [];

  if (level === "campaign") {
    const r = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        dailyBudget: sql<string | null>`${campaigns.dailyBudget}`,
        ...insightsExpr,
      })
      .from(adInsightsDaily)
      .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
      .innerJoin(adsets, eq(adsets.id, ads.adsetId))
      .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
      .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
      .where(and(...conds))
      .groupBy(campaigns.id, campaigns.name, campaigns.status, campaigns.dailyBudget);

    rows = r.map((x) => ({
      id: x.id,
      name: x.name,
      status: x.status,
      dailyBudget: x.dailyBudget ? Number(x.dailyBudget) / 100 : null, // Meta retorna em centavos
      spend: Number(x.spend),
      impressions: Number(x.impressions),
      clicks: Number(x.clicks),
      leads: Number(x.leads),
      purchases: Number(x.purchases),
      revenue: Number(x.revenue),
      thumbnailUrl: null,
    }));
  } else if (level === "adset") {
    const r = await db
      .select({
        id: adsets.id,
        name: adsets.name,
        status: adsets.status,
        dailyBudget: sql<string | null>`${adsets.dailyBudget}`,
        ...insightsExpr,
      })
      .from(adInsightsDaily)
      .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
      .innerJoin(adsets, eq(adsets.id, ads.adsetId))
      .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
      .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
      .where(and(...conds))
      .groupBy(adsets.id, adsets.name, adsets.status, adsets.dailyBudget);

    rows = r.map((x) => ({
      id: x.id,
      name: x.name,
      status: x.status,
      dailyBudget: x.dailyBudget ? Number(x.dailyBudget) / 100 : null,
      spend: Number(x.spend),
      impressions: Number(x.impressions),
      clicks: Number(x.clicks),
      leads: Number(x.leads),
      purchases: Number(x.purchases),
      revenue: Number(x.revenue),
      thumbnailUrl: null,
    }));
  } else {
    const r = await db
      .select({
        id: ads.id,
        name: ads.name,
        status: ads.status,
        thumbnailUrl: creatives.thumbnailUrl,
        ...insightsExpr,
      })
      .from(adInsightsDaily)
      .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
      .leftJoin(creatives, eq(creatives.id, ads.creativeId))
      .innerJoin(adsets, eq(adsets.id, ads.adsetId))
      .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
      .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
      .where(and(...conds))
      .groupBy(ads.id, ads.name, ads.status, creatives.thumbnailUrl);

    rows = r.map((x) => ({
      id: x.id,
      name: x.name,
      status: x.status,
      dailyBudget: null,
      spend: Number(x.spend),
      impressions: Number(x.impressions),
      clicks: Number(x.clicks),
      leads: Number(x.leads),
      purchases: Number(x.purchases),
      revenue: Number(x.revenue),
      thumbnailUrl: x.thumbnailUrl,
    }));
  }

  return rows
    .map((r) => ({
      ...r,
      cpa: divSafe(r.spend, r.purchases),
      cpl: divSafe(r.spend, r.leads),
      ctr: divSafe(r.clicks, r.impressions) * 100,
      roas: divSafe(r.revenue, r.spend),
      profit: r.revenue - r.spend,
    }))
    .sort((a, b) => b.spend - a.spend);
}
