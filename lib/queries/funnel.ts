import { and, eq, gte, lte, sql, type SQL, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adAccounts,
  adInsightsDaily,
  ads,
  adsets,
  campaigns,
  creatives,
} from "@/lib/schema";
import { getProduct, type ProductSlug } from "@/lib/products";
import { productScopeWhere } from "./product-scope";
import type { DateRange } from "./dashboard";

export interface FunnelOptions {
  /** Quando true, retorna só itens cujo ad/adset/campaign estão ACTIVE no Meta */
  onlyActive?: boolean;
}

function activeWhere(onlyActive: boolean | undefined): SQL[] {
  if (!onlyActive) return [];
  return [
    eq(ads.status, "ACTIVE"),
    eq(adsets.status, "ACTIVE"),
    eq(campaigns.status, "ACTIVE"),
  ];
}

/* ─── 1. Diário do Funil ─── */

export interface DailyFunnelRow {
  date: string;
  impressions: number;
  clicks: number;
  /** inline_link_clicks — denominador do connect rate (Meta) */
  linkClicks: number;
  spend: number;
  landingPageView: number;
  initiateCheckout: number;
  purchase: number;
}

export async function getDailyFunnel(
  slug: ProductSlug,
  range: DateRange,
  opts: FunnelOptions = {},
): Promise<DailyFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
    ...activeWhere(opts.onlyActive),
  ];

  const rows = await db
    .select({
      date: adInsightsDaily.date,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      linkClicks: sql<number>`coalesce(sum(${adInsightsDaily.linkClicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      lpv: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'landing_page_view')::int), 0)`,
      chkt: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'initiate_checkout')::int), 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(adInsightsDaily.date)
    .orderBy(desc(adInsightsDaily.date));

  return rows.map((r) => ({
    date: r.date,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    linkClicks: Number(r.linkClicks),
    spend: Number(r.spend),
    landingPageView: Number(r.lpv),
    initiateCheckout: Number(r.chkt),
    purchase: Number(r.purchase),
  }));
}

/* ─── 2. Por Campanha ─── */

export interface CampaignFunnelRow {
  campaignId: number;
  campaignName: string;
  status: string;
  objective: string | null;
  adsetCount: number;
  adCount: number;
  impressions: number;
  clicks: number;
  /** inline_link_clicks — denominador do connect rate (Meta) */
  linkClicks: number;
  spend: number;
  reach: number;
  landingPageView: number;
  initiateCheckout: number;
  purchase: number;
  /** Receita Hotmart atribuída à campanha (match por nome via sck). Preenchido na página. */
  hotRevenue?: number;
  /** ROAS real = hotRevenue / spend. Preenchido na página. */
  roasReal?: number;
}

export async function getCampaignFunnel(
  slug: ProductSlug,
  range: DateRange,
  opts: FunnelOptions = {},
): Promise<CampaignFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
    ...activeWhere(opts.onlyActive),
  ];

  const rows = await db
    .select({
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      status: campaigns.status,
      objective: campaigns.objective,
      adsetCount: sql<number>`count(distinct ${adsets.id})::int`,
      adCount: sql<number>`count(distinct ${ads.id})::int`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      linkClicks: sql<number>`coalesce(sum(${adInsightsDaily.linkClicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      reach: sql<number>`coalesce(sum(${adInsightsDaily.reach})::int, 0)`,
      lpv: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'landing_page_view')::int), 0)`,
      chkt: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'initiate_checkout')::int), 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(campaigns.id, campaigns.name, campaigns.status, campaigns.objective)
    .orderBy(desc(sql`sum(${adInsightsDaily.spend})`));

  return rows.map((r) => ({
    campaignId: Number(r.campaignId),
    campaignName: String(r.campaignName),
    status: String(r.status),
    objective: r.objective ?? null,
    adsetCount: Number(r.adsetCount),
    adCount: Number(r.adCount),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    linkClicks: Number(r.linkClicks),
    spend: Number(r.spend),
    reach: Number(r.reach),
    landingPageView: Number(r.lpv),
    initiateCheckout: Number(r.chkt),
    purchase: Number(r.purchase),
  }));
}

/* ─── 3. Por Criativo ─── */

export interface CreativeFunnelRow {
  adId: number;
  adName: string;
  status: string;
  thumbnailUrl: string | null;
  landingUrl: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  purchase: number;
}

export async function getCreativeFunnel(
  slug: ProductSlug,
  range: DateRange,
  limit = 50,
  opts: FunnelOptions = {},
): Promise<CreativeFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
    ...activeWhere(opts.onlyActive),
  ];

  const rows = await db
    .select({
      adId: ads.id,
      adName: ads.name,
      status: ads.status,
      thumbnailUrl: creatives.thumbnailUrl,
      landingUrl: ads.landingUrl,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(ads.id, ads.name, ads.status, creatives.thumbnailUrl, ads.landingUrl)
    .orderBy(desc(sql`sum(${adInsightsDaily.spend})`))
    .limit(limit);

  return rows.map((r) => ({
    adId: Number(r.adId),
    adName: String(r.adName),
    status: String(r.status),
    thumbnailUrl: r.thumbnailUrl,
    landingUrl: r.landingUrl,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    spend: Number(r.spend),
    purchase: Number(r.purchase),
  }));
}

/* ─── 4. Por Página ─── */

export interface PageFunnelRow {
  landingUrl: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  landingPageView: number;
  initiateCheckout: number;
  purchase: number;
}

export async function getPageFunnel(
  slug: ProductSlug,
  range: DateRange,
  opts: FunnelOptions = {},
): Promise<PageFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
    ...activeWhere(opts.onlyActive),
  ];

  const rows = await db
    .select({
      landingUrl: ads.landingUrl,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      lpv: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'landing_page_view')::int), 0)`,
      chkt: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'initiate_checkout')::int), 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(ads.landingUrl)
    .orderBy(desc(sql`sum(${adInsightsDaily.spend})`));

  return rows.map((r) => ({
    landingUrl: r.landingUrl,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    spend: Number(r.spend),
    landingPageView: Number(r.lpv),
    initiateCheckout: Number(r.chkt),
    purchase: Number(r.purchase),
  }));
}
