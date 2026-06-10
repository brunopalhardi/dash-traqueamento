import { sql, and, gte, lte, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adInsightsDaily } from "@/lib/schema/insights";
import { ads, adsets, campaigns, adAccounts, creatives } from "@/lib/schema/meta";
import { getProduct, PRODUCTS, type ProductSlug } from "@/lib/products";
import { productScopeWhere } from "./product-scope";
import {
  todayBR,
  addDays as addDaysISO,
  rangeLastDays as rangeLastDaysBR,
  rangePreviousPeriod as rangePreviousPeriodBR,
} from "@/lib/utils/date-ranges";

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
  /** ID do anúncio no Meta (pra montar link do Ad Library) */
  metaAdId: string;
  adName: string;
  campaignName: string;
  thumbnailUrl: string | null;
  /** ACTIVE | PAUSED | DELETED etc., conforme o Meta */
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
}

export interface AdDailyPoint {
  date: string;
  spend: number;
  leads: number;
  purchases: number;
  revenue: number;
  /** Custo por venda do dia (0 se não houve venda) */
  cpa: number;
}

export interface AdDetail {
  adId: number;
  metaAdId: string;
  adName: string;
  /** ACTIVE | PAUSED | DELETED etc., conforme o Meta */
  status: string;
  campaignName: string;
  thumbnailUrl: string | null;
  previewShareableLink: string | null;
  /** Adset pai */
  adsetName: string;
  adsetStatus: string;
  adsetDailyBudget: number | null; // BRL
  adsetOptimizationGoal: string | null;
  /** Conta Meta (act_XXX) pra link do Ads Manager */
  accountMetaId: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  ctr: number; // %
  cpl: number;
  cac: number;
  roas: number;
  videoViews: number;
  video3s: number;
  video25: number;
  video50: number;
  video75: number;
  video95: number;
  hookRate: number; // %
  holdRate: number; // %
  bodyRate: number; // %
  score: number; // 0-100
  /** Série diária dos últimos 14 dias até range.to */
  daily: AdDailyPoint[];
}

/* ─────────────────────────────────────────────────────────────────────── */

function divSafe(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
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
      productSlug: campaigns.productSlug,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .where(and(gte(adInsightsDaily.date, range.from), lte(adInsightsDaily.date, range.to)))
    .groupBy(campaigns.productSlug);

  const labelOf = (slug: ProductSlug | "outros") =>
    slug === "outros"
      ? "Outros"
      : PRODUCTS.find((p) => p.slug === slug)?.shortLabel ?? slug;

  const out: ProductBreakdownRow[] = [];
  for (const r of rows) {
    const slug = (r.productSlug ?? "outros") as ProductSlug | "outros";
    if (slug === "geral" || slug === "outros") continue;
    out.push({
      productSlug: slug,
      label: labelOf(slug),
      spend: Number(r.spend),
      leads: Number(r.leads),
      purchases: Number(r.purchases),
      revenue: Number(r.revenue),
      roas: divSafe(Number(r.revenue), Number(r.spend)),
    });
  }
  return out.sort((a, b) => b.spend - a.spend);
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
 * Range "ciclo atual" = últimos `cycleDays` dias terminando hoje (fuso BR).
 * Se `customStart`+`customEnd` forem passados, ignora cycleDays e usa o intervalo direto.
 */
export function rangeCurrentCycle(
  cycleDays: number,
  custom?: { start: string; end: string },
): DateRange {
  if (custom) return { from: custom.start, to: custom.end };
  const today = todayBR();
  return { from: addDaysISO(today, -(cycleDays - 1)), to: today };
}

/** Range do ciclo anterior (de mesmo tamanho) ao atual. */
export function rangePreviousCycle(currentRange: DateRange): DateRange {
  return rangePreviousPeriodBR(currentRange);
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
        (new Date(opts.custom.end + "T12:00:00Z").getTime() -
          new Date(opts.custom.start + "T12:00:00Z").getTime()) /
          86400000,
      ) + 1
    : null;
  const cycleDays = customDays ?? opts.cycleDays ?? 7;
  const cyclesBack = opts.cyclesBack ?? 4;

  const current = rangeCurrentCycle(cycleDays, opts.custom);

  // Range total: do início do ciclo mais antigo até o fim do ciclo atual
  const oldestStart = addDays(
    new Date(current.from + "T12:00:00Z"),
    -cycleDays * cyclesBack,
  );
  const fullRange: DateRange = {
    from: dateISO(oldestStart),
    to: current.to,
  };

  const series = await getDailySeries(slug, fullRange);
  const currentStart = new Date(current.from + "T12:00:00Z");

  return series.map((p) => {
    const d = new Date(p.date + "T12:00:00Z");
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
  opts: {
    limit?: number;
    orderBy?: "roas" | "spend" | "purchases" | "cpa";
    onlyActive?: boolean;
  } = {},
): Promise<AdRow[]> {
  const limit = opts.limit ?? 50;
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];
  if (opts.onlyActive) conds.push(eq(ads.status, "ACTIVE"));

  const rows = await db
    .select({
      adId: ads.id,
      metaAdId: ads.metaId,
      adName: ads.name,
      adStatus: ads.status,
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
    .groupBy(ads.id, ads.metaId, ads.name, ads.status, campaigns.name, creatives.thumbnailUrl);

  const enriched: AdRow[] = rows.map((r) => {
    const spend = Number(r.spend);
    const purchases = Number(r.purchases);
    const revenue = Number(r.revenue);
    return {
      adId: r.adId,
      metaAdId: r.metaAdId,
      adName: r.adName,
      status: r.adStatus,
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
  if (orderBy === "cpa") {
    // CPA: menor é melhor. Sem venda no período = não entra no top.
    return enriched
      .filter((r) => r.purchases > 0)
      .sort((a, b) => a.cpa - b.cpa)
      .slice(0, limit);
  }
  enriched.sort((a, b) => (b[orderBy] as number) - (a[orderBy] as number));
  return enriched.slice(0, limit);
}

/* ─────────────────────────────────────────────────────────────────────── */
// Helpers de range — delegam pro lib/utils/date-ranges (fuso BR correto).

export function todayISO(): string {
  return todayBR();
}

export function rangeLastDays(days: number): DateRange {
  return rangeLastDaysBR(days);
}

export function rangePreviousPeriod(range: DateRange): DateRange {
  return rangePreviousPeriodBR(range);
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

/**
 * Retorna métricas agregadas de UM ad no período + métricas derivadas
 * de vídeo (Hook Rate, Hold Rate, Body Rate, Score).
 *
 * Fórmulas:
 *   - Hook Rate = video_p3s / impressions × 100
 *   - Hold Rate = video_p25 / impressions × 100
 *   - Body Rate = video_p50 / impressions × 100
 *   - Score = (Hook × 0.3 + Hold × 0.4 + Body × 0.3)
 */
export async function getAdDetail(
  adId: number,
  range: DateRange,
): Promise<AdDetail | null> {
  const [row] = await db
    .select({
      adId: ads.id,
      metaAdId: ads.metaId,
      adName: ads.name,
      adStatus: ads.status,
      campaignName: campaigns.name,
      thumbnailUrl: creatives.thumbnailUrl,
      previewShareableLink: ads.previewUrl,
      adsetName: adsets.name,
      adsetStatus: adsets.status,
      adsetDailyBudget: sql<string | null>`${adsets.dailyBudget}`,
      adsetOptimizationGoal: adsets.optimizationGoal,
      accountMetaId: adAccounts.metaAccountId,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
      videoViews: sql<number>`coalesce(sum(${adInsightsDaily.videoViews})::int, 0)`,
      video3s: sql<number>`coalesce(sum(${adInsightsDaily.videoP3s})::int, 0)`,
      video25: sql<number>`coalesce(sum(${adInsightsDaily.videoP25})::int, 0)`,
      video50: sql<number>`coalesce(sum(${adInsightsDaily.videoP50})::int, 0)`,
      video75: sql<number>`coalesce(sum(${adInsightsDaily.videoP75})::int, 0)`,
      video95: sql<number>`coalesce(sum(${adInsightsDaily.videoP95})::int, 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .where(
      and(
        eq(ads.id, adId),
        gte(adInsightsDaily.date, range.from),
        lte(adInsightsDaily.date, range.to),
      ),
    )
    .groupBy(
      ads.id,
      ads.metaId,
      ads.name,
      ads.status,
      ads.previewUrl,
      campaigns.name,
      creatives.thumbnailUrl,
      adsets.name,
      adsets.status,
      adsets.dailyBudget,
      adsets.optimizationGoal,
      adAccounts.metaAccountId,
    );

  if (!row) return null;

  const impressions = Number(row.impressions);
  const clicks = Number(row.clicks);
  const spend = Number(row.spend);
  const leads = Number(row.leads);
  const purchases = Number(row.purchases);
  const revenue = Number(row.revenue);
  const video3s = Number(row.video3s);
  const video25 = Number(row.video25);
  const video50 = Number(row.video50);

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpl = leads > 0 ? spend / leads : 0;
  const cac = purchases > 0 ? spend / purchases : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const hookRate = impressions > 0 ? (video3s / impressions) * 100 : 0;
  const holdRate = impressions > 0 ? (video25 / impressions) * 100 : 0;
  const bodyRate = impressions > 0 ? (video50 / impressions) * 100 : 0;
  const score = hookRate * 0.3 + holdRate * 0.4 + bodyRate * 0.3;

  // Série diária de 14d até range.to — preenche zeros pra dias sem insight
  const dailyFrom = (() => {
    const d = new Date(range.to + "T12:00:00");
    d.setDate(d.getDate() - 13);
    return dateISO(d);
  })();
  const dailyRows = await db
    .select({
      date: adInsightsDaily.date,
      spend: sql<number>`coalesce(${adInsightsDaily.spend}::float, 0)`,
      leads: sql<number>`coalesce((${adInsightsDaily.conversions}->>'lead')::float, 0)`,
      purchases: sql<number>`coalesce((${adInsightsDaily.conversions}->>'purchase')::float, 0)`,
      revenue: sql<number>`coalesce((${adInsightsDaily.conversions}->>'revenue')::float, 0)`,
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.adId, adId),
        gte(adInsightsDaily.date, dailyFrom),
        lte(adInsightsDaily.date, range.to),
      ),
    );
  const dailyMap = new Map(dailyRows.map((d) => [d.date, d]));
  const daily: AdDailyPoint[] = [];
  const cursor = new Date(dailyFrom + "T12:00:00");
  const endCursor = new Date(range.to + "T12:00:00");
  while (cursor <= endCursor) {
    const iso = dateISO(cursor);
    const r = dailyMap.get(iso);
    const dSpend = r ? Number(r.spend) : 0;
    const dPurchases = r ? Number(r.purchases) : 0;
    daily.push({
      date: iso,
      spend: dSpend,
      leads: r ? Number(r.leads) : 0,
      purchases: dPurchases,
      revenue: r ? Number(r.revenue) : 0,
      cpa: dPurchases > 0 ? dSpend / dPurchases : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    adId: row.adId,
    metaAdId: row.metaAdId,
    adName: row.adName,
    status: row.adStatus,
    campaignName: row.campaignName,
    thumbnailUrl: row.thumbnailUrl,
    previewShareableLink: row.previewShareableLink,
    adsetName: row.adsetName,
    adsetStatus: row.adsetStatus,
    adsetDailyBudget: row.adsetDailyBudget ? Number(row.adsetDailyBudget) / 100 : null,
    adsetOptimizationGoal: row.adsetOptimizationGoal,
    accountMetaId: row.accountMetaId,
    spend,
    impressions,
    clicks,
    leads,
    purchases,
    revenue,
    ctr,
    cpl,
    cac,
    roas,
    videoViews: Number(row.videoViews),
    video3s,
    video25,
    video50,
    video75: Number(row.video75),
    video95: Number(row.video95),
    hookRate,
    holdRate,
    bodyRate,
    score,
    daily,
  };
}
