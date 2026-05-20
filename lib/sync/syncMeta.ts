import { eq, inArray, and, lt } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { adAccounts, campaigns, adsets, ads, creatives } from "@/lib/schema/meta";
import { adInsightsDaily } from "@/lib/schema/insights";
import { syncJobs } from "@/lib/schema/sync";
import type { MetaClient } from "@/lib/meta/client";
import type { DatePreset, MetaCreative, MetaInsight, MetaInsightAction } from "@/lib/meta/types";
import { MetaAuthError } from "@/lib/meta/errors";

/**
 * Job órfão = "running" há mais que ORPHAN_THRESHOLD_MS. O Vercel mata a função
 * em 300s sem aviso, então o sync nunca consegue marcar `failed`. Marcamos esses
 * jobs antes de iniciar o próximo pra UI não ficar travada em "em andamento".
 */
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

export async function reapOrphanJobs(db: typeof defaultDb = defaultDb): Promise<number[]> {
  const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
  const reaped = await db
    .update(syncJobs)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "vercel timeout (orphan reaped)",
    })
    .where(and(eq(syncJobs.status, "running"), lt(syncJobs.startedAt, cutoff)))
    .returning({ id: syncJobs.id });
  return reaped.map((r) => r.id);
}

export type SyncMode = "backfill" | "daily" | "manual";

const MODE_TO_PRESET: Record<SyncMode, DatePreset> = {
  backfill: "last_30d",
  daily: "last_7d",
  manual: "last_30d",
};

// Removido SYNC_CREATIVES gating — antes pulávamos creatives no daily/manual
// porque scan completo de /adcreatives era lento demais (10k+ orphans
// históricos do account). Agora usamos getCreativesByIds só com os criativos
// REFERENCIADOS por ads ativos (~100-500), então sempre roda em todo modo.

interface AccountSyncResult {
  accountId: number;
  metaAccountId: string;
  rowsByTable: Record<string, number>;
  error?: string;
}

interface SyncMetaDeps {
  db?: typeof defaultDb;
  client: MetaClient;
}

// Upserts sequenciais (await dentro de for-of) eram o gargalo do sync manual:
// 1k+ creatives × ~200ms/upsert = >3min, estourava o budget de 300s da Vercel.
// Batches paralelos resolvem sem mudar arquitetura — o pool do Supabase aguenta
// 20 conexões simultâneas tranquilo e nenhuma chamada extra à Meta API é feita.
const UPSERT_BATCH = 20;

async function inBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

function mapCreativeType(meta: MetaCreative): "image" | "video" | "carousel" | "other" {
  const t = meta.object_type?.toUpperCase();
  if (t === "VIDEO") return "video";
  if (t === "PHOTO" || t === "SHARE") return "image";
  if (t === "CAROUSEL") return "carousel";
  return "other";
}

function sumActions(actions: MetaInsight["actions"], match: (t: string) => boolean): number {
  if (!actions) return 0;
  return actions
    .filter((a) => match(a.action_type))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

/**
 * O Meta Pixel reporta a mesma compra em vários `action_type` ao mesmo tempo
 * (`purchase`, `offsite_conversion.fb_pixel_purchase`, `omni_purchase`,
 * `web_in_store_purchase`, `onsite_web_purchase`...). Se somarmos tudo, a
 * gente conta a venda 4x. A regra: pegar **um** representante por evento.
 *
 * Ordem de prioridade: omni_purchase → fb_pixel_purchase → onsite/web_purchase
 * → purchase (last resort, costuma ser duplicata).
 */
function pickByPriority(
  actions: MetaInsight["actions"],
  matchers: Array<(t: string) => boolean>,
): number {
  if (!actions) return 0;
  for (const match of matchers) {
    const v = actions
      .filter((a) => match(a.action_type))
      .reduce((sum, a) => sum + Number(a.value || 0), 0);
    if (v > 0) return v;
  }
  return 0;
}

/**
 * `video_play_actions` é um campo cujo array contém só action_types "video_view"
 * e "video_play_curve" — usar pra videoViews.
 *
 * Já as métricas de % assistido (p25/p50/p75/p95) e 3-sec são **fields top-level
 * separados** do insight, cada um com seu próprio array. Action_type interno é
 * "video_view" — somar values.
 *
 * Aprendizado: na 1ª versão eu assumi que tudo estava dentro de video_play_actions
 * e fui buscar pelo nome do field como se fosse action_type. Resultado: zerado.
 */
function findVideoView(actions: MetaInsightAction[] | undefined): number | null {
  if (!actions) return null;
  const found = actions.find((a) => a.action_type === "video_view");
  if (!found) {
    // Fallback: alguns accounts retornam outras action_types — soma tudo
    const total = actions.reduce((sum, a) => sum + Number(a.value || 0), 0);
    return Number.isFinite(total) && total > 0 ? total : null;
  }
  const n = Number(found.value);
  return Number.isFinite(n) ? n : null;
}

function extractConversions(insight: MetaInsight): Record<string, number> {
  const isLead = (t: string) =>
    t === "lead" ||
    t.endsWith(".lead") ||
    t === "onsite_conversion.lead_grouped" ||
    t === "offsite_conversion.fb_pixel_lead";

  const purchaseMatchers = [
    (t: string) => t === "omni_purchase",
    (t: string) => t === "offsite_conversion.fb_pixel_purchase",
    (t: string) => t === "onsite_web_purchase" || t === "web_in_store_purchase",
    (t: string) => t === "purchase",
  ];

  const isFollow = (t: string) =>
    t === "onsite_conversion.follow" || t === "follow";
  const isEngagement = (t: string) =>
    t === "post_engagement" ||
    t === "post_reaction" ||
    t === "comment" ||
    t === "post_save" ||
    t === "page_engagement";

  return {
    lead: sumActions(insight.actions, isLead),
    purchase: pickByPriority(insight.actions, purchaseMatchers),
    revenue: pickByPriority(insight.action_values, purchaseMatchers),
    follow: sumActions(insight.actions, isFollow),
    engagement: sumActions(insight.actions, isEngagement),
  };
}

export async function syncMeta(
  opts: { mode: SyncMode } & SyncMetaDeps,
): Promise<{ jobId: number; status: "done" | "failed"; results: AccountSyncResult[] }> {
  const db = opts.db ?? defaultDb;
  const preset = MODE_TO_PRESET[opts.mode];
  const jobType = opts.mode === "backfill" ? "meta_full" : "meta_incremental";

  // Limpa jobs órfãos (Vercel matou a função antes de marcar failed)
  await reapOrphanJobs(db);

  const [job] = await db
    .insert(syncJobs)
    .values({ type: jobType, status: "running", startedAt: new Date() })
    .returning({ id: syncJobs.id });

  const activeAccounts = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.isActive, true));

  const results: AccountSyncResult[] = [];

  for (const account of activeAccounts) {
    const r: AccountSyncResult = {
      accountId: account.id,
      metaAccountId: account.metaAccountId,
      rowsByTable: { campaigns: 0, adsets: 0, ads: 0, creatives: 0, ad_insights_daily: 0 },
    };
    const actId = account.metaAccountId.startsWith("act_")
      ? account.metaAccountId
      : `act_${account.metaAccountId}`;

    try {
      // Campaigns
      const apiCampaigns = await opts.client.getCampaigns(actId);
      for (const c of apiCampaigns) {
        await db
          .insert(campaigns)
          .values({
            adAccountId: account.id,
            metaId: c.id,
            name: c.name,
            objective: c.objective,
            status: c.status,
            dailyBudget: c.daily_budget ?? null,
            lifetimeBudget: c.lifetime_budget ?? null,
            startTime: c.start_time ? new Date(c.start_time) : null,
            stopTime: c.stop_time ? new Date(c.stop_time) : null,
          })
          .onConflictDoUpdate({
            target: campaigns.metaId,
            set: {
              name: c.name,
              objective: c.objective,
              status: c.status,
              dailyBudget: c.daily_budget ?? null,
              lifetimeBudget: c.lifetime_budget ?? null,
              startTime: c.start_time ? new Date(c.start_time) : null,
              stopTime: c.stop_time ? new Date(c.stop_time) : null,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.campaigns++;
      }

      // Adsets
      const campaignIdMap = new Map<string, number>(
        (
          await db
            .select({ id: campaigns.id, metaId: campaigns.metaId })
            .from(campaigns)
            .where(eq(campaigns.adAccountId, account.id))
        ).map((row) => [row.metaId, row.id]),
      );

      const apiAdsets = await opts.client.getAdSets(actId);
      for (const s of apiAdsets) {
        const campaignDbId = campaignIdMap.get(s.campaign_id);
        if (!campaignDbId) continue;
        await db
          .insert(adsets)
          .values({
            campaignId: campaignDbId,
            metaId: s.id,
            name: s.name,
            status: s.status,
            dailyBudget: s.daily_budget ?? null,
            targeting: s.targeting ?? null,
            optimizationGoal: s.optimization_goal,
          })
          .onConflictDoUpdate({
            target: adsets.metaId,
            set: {
              name: s.name,
              status: s.status,
              dailyBudget: s.daily_budget ?? null,
              targeting: s.targeting ?? null,
              optimizationGoal: s.optimization_goal,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.adsets++;
      }

      // Ads
      const accountCampaignIds = Array.from(campaignIdMap.values());
      const adsetIdMap = new Map<string, number>(
        accountCampaignIds.length === 0
          ? []
          : (
              await db
                .select({ id: adsets.id, metaId: adsets.metaId })
                .from(adsets)
                .where(inArray(adsets.campaignId, accountCampaignIds))
            ).map((row) => [row.metaId, row.id]),
      );

      const apiAds = await opts.client.getAds(actId);

      // Buscar só os criativos REFERENCIADOS pelos ads ativos via
      // /?ids=… batched. Evita scan de 10k+ orphans históricos do account.
      const referencedCreativeIds = Array.from(
        new Set(
          apiAds
            .map((a) => a.creative?.id)
            .filter((id): id is string => typeof id === "string"),
        ),
      );

      const apiCreatives = await opts.client.getCreativesByIds(referencedCreativeIds);
      await inBatches(apiCreatives, UPSERT_BATCH, async (cr) => {
        // image_url quando disponível (alta res); thumbnail_url default de fallback.
        const thumb = cr.image_url ?? cr.thumbnail_url;
        await db
          .insert(creatives)
          .values({
            metaId: cr.id,
            name: cr.name,
            type: mapCreativeType(cr),
            thumbnailUrl: thumb,
            headline: cr.title,
            body: cr.body,
            callToAction: cr.call_to_action_type,
          })
          .onConflictDoUpdate({
            target: creatives.metaId,
            set: {
              name: cr.name,
              type: mapCreativeType(cr),
              thumbnailUrl: thumb,
              headline: cr.title,
              body: cr.body,
              callToAction: cr.call_to_action_type,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.creatives++;
      });

      const creativeIdMap = new Map<string, number>(
        referencedCreativeIds.length === 0
          ? []
          : (
              await db
                .select({ id: creatives.id, metaId: creatives.metaId })
                .from(creatives)
                .where(inArray(creatives.metaId, referencedCreativeIds))
            ).map((row) => [row.metaId, row.id]),
      );
      await inBatches(apiAds, UPSERT_BATCH, async (a) => {
        const adsetDbId = adsetIdMap.get(a.adset_id);
        if (!adsetDbId) return;
        const creativeDbId = a.creative?.id ? creativeIdMap.get(a.creative.id) ?? null : null;
        await db
          .insert(ads)
          .values({
            adsetId: adsetDbId,
            metaId: a.id,
            name: a.name,
            status: a.status,
            creativeId: creativeDbId,
            previewUrl: a.preview_shareable_link,
          })
          .onConflictDoUpdate({
            target: ads.metaId,
            set: {
              name: a.name,
              status: a.status,
              creativeId: creativeDbId,
              previewUrl: a.preview_shareable_link,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.ads++;
      });

      // Insights
      const accountAdsetIds = Array.from(adsetIdMap.values());
      const adIdMap = new Map<string, number>(
        accountAdsetIds.length === 0
          ? []
          : (
              await db
                .select({ id: ads.id, metaId: ads.metaId })
                .from(ads)
                .where(inArray(ads.adsetId, accountAdsetIds))
            ).map((row) => [row.metaId, row.id]),
      );

      const apiInsights = await opts.client.getInsights(actId, { datePreset: preset });
      await inBatches(apiInsights, UPSERT_BATCH, async (ins) => {
        const adDbId = adIdMap.get(ins.ad_id);
        if (!adDbId) return;
        const conversions = extractConversions(ins);
        // Meta define "video view" = ≥3 segundos. Então videoViews E videoP3s
        // vêm do MESMO campo: action_type "video_view" em video_play_actions.
        // Hook Rate = video_p3s / impressions usa esse valor.
        const videoViews = findVideoView(ins.video_play_actions);
        const videoP3s = videoViews;
        const videoP25 = findVideoView(ins.video_p25_watched_actions);
        const videoP50 = findVideoView(ins.video_p50_watched_actions);
        const videoP75 = findVideoView(ins.video_p75_watched_actions);
        const videoP95 = findVideoView(ins.video_p95_watched_actions);
        await db
          .insert(adInsightsDaily)
          .values({
            adId: adDbId,
            date: ins.date_start,
            impressions: Number(ins.impressions ?? 0),
            clicks: Number(ins.clicks ?? 0),
            spend: ins.spend ?? "0",
            cpm: ins.cpm ?? null,
            ctr: ins.ctr ?? null,
            reach: ins.reach ? Number(ins.reach) : null,
            frequency: ins.frequency ?? null,
            linkClicks: ins.inline_link_clicks ? Number(ins.inline_link_clicks) : null,
            videoViews,
            videoP3s,
            videoP25,
            videoP50,
            videoP75,
            videoP95,
            conversions,
          })
          .onConflictDoUpdate({
            target: [adInsightsDaily.adId, adInsightsDaily.date],
            set: {
              impressions: Number(ins.impressions ?? 0),
              clicks: Number(ins.clicks ?? 0),
              spend: ins.spend ?? "0",
              cpm: ins.cpm ?? null,
              ctr: ins.ctr ?? null,
              reach: ins.reach ? Number(ins.reach) : null,
              frequency: ins.frequency ?? null,
              linkClicks: ins.inline_link_clicks ? Number(ins.inline_link_clicks) : null,
              videoViews,
              videoP3s,
              videoP25,
              videoP50,
              videoP75,
              videoP95,
              conversions,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.ad_insights_daily++;
      });

      await db
        .update(adAccounts)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(adAccounts.id, account.id));
    } catch (err) {
      r.error = err instanceof Error ? err.message : String(err);
      if (err instanceof MetaAuthError) {
        console.error(JSON.stringify({ msg: "meta_auth_error", accountId: account.id }));
      }
    }

    results.push(r);
  }

  const totalRows = results.reduce(
    (sum, r) => sum + Object.values(r.rowsByTable).reduce((a, b) => a + b, 0),
    0,
  );
  const anyFailed = results.some((r) => r.error);
  const allFailed = results.length > 0 && results.every((r) => r.error);
  const status: "done" | "failed" = allFailed ? "failed" : "done";

  // Concatena os erros reais por account no errorMessage — antes era só
  // "see details" e não tinha onde ver os details na UI.
  const errorSummary = anyFailed
    ? results
        .filter((r) => r.error)
        .map((r) => `${r.metaAccountId}: ${r.error}`)
        .join(" | ")
        .slice(0, 500)
    : null;

  await db
    .update(syncJobs)
    .set({
      status,
      finishedAt: new Date(),
      rowsProcessed: totalRows,
      errorMessage: errorSummary,
      details: { mode: opts.mode, results } as Record<string, unknown>,
    })
    .where(eq(syncJobs.id, job.id));

  return { jobId: job.id, status, results };
}
