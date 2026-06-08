import { and, eq, gte, lte } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { ads, adsets, campaigns, adAccounts } from "@/lib/schema/meta";
import {
  vturbPlayers, vturbPages, vturbPagePlayers, vturbPageDaily, vturbRetentionDaily,
} from "@/lib/schema/vturb";
import { getProduct } from "@/lib/products";
import { normalizePageUrl, fetchPlayerIds, type ScrapeResult } from "@/lib/vturb/scrape";
import { aggregatePageDay, normalizeCurve, mergeCurves } from "@/lib/vturb/aggregate";
import type { VturbClient } from "@/lib/vturb/client";
import type { PlayerDayInput, CurveBucket } from "@/lib/vturb/types";

export type VturbSyncMode = "daily" | "backfill" | "manual";

export interface SyncVturbDeps {
  db?: typeof defaultDb;
  client: VturbClient;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  range: { from: string; to: string };
  productSlug?: "guia";
}

export interface SyncVturbResult {
  pagesActive: number;
  pagesMapped: number;
  pagesNoEmbed: number;
  pagesHttpError: number;
  playersUpserted: number;
  daysWritten: number;
}

/** Decisão pura: pula scrape se já tem mapeamento manual; senão raspa. */
export async function resolvePageMapping(
  page: { pageUrl: string; hasManual: boolean },
  fetchImpl: typeof fetch,
): Promise<{ skipped: true } | { skipped: false; scrape: ScrapeResult }> {
  if (page.hasManual) return { skipped: true };
  const scrape = await fetchPlayerIds(page.pageUrl, fetchImpl);
  return { skipped: false, scrape };
}

export async function syncVturb(deps: SyncVturbDeps): Promise<SyncVturbResult> {
  const db = deps.db ?? defaultDb;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const slug = deps.productSlug ?? "guia";
  const product = getProduct(slug);
  const result: SyncVturbResult = {
    pagesActive: 0, pagesMapped: 0, pagesNoEmbed: 0, pagesHttpError: 0,
    playersUpserted: 0, daysWritten: 0,
  };

  const players = await deps.client.listPlayers();
  for (const p of players) {
    await db.insert(vturbPlayers).values({
      playerId: p.playerId, name: p.name, durationSec: p.durationSec,
      pitchTimeSec: p.pitchTimeSec, vturbCreatedAt: p.createdAt ? new Date(p.createdAt) : null,
    }).onConflictDoUpdate({
      target: vturbPlayers.playerId,
      set: { name: p.name, durationSec: p.durationSec, pitchTimeSec: p.pitchTimeSec, updatedAt: new Date() },
    });
  }
  result.playersUpserted = players.length;
  const playerById = new Map(players.map((p) => [p.playerId, p]));

  if (!product.metaAccountId) throw new Error("Produto sem metaAccountId");
  const adRows = await db
    .select({ landingUrl: ads.landingUrl })
    .from(ads)
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(adAccounts.metaAccountId, product.metaAccountId), eq(ads.status, "ACTIVE")));

  const activeUrls = new Map<string, string>();
  for (const r of adRows) {
    const norm = normalizePageUrl(r.landingUrl);
    if (norm && !activeUrls.has(norm)) activeUrls.set(norm, r.landingUrl!);
  }
  result.pagesActive = activeUrls.size;

  await db.update(vturbPages).set({ isActive: false, updatedAt: new Date() })
    .where(eq(vturbPages.productSlug, slug));

  for (const [norm, raw] of activeUrls) {
    await db.insert(vturbPages).values({ productSlug: slug, pageUrl: norm, rawExampleUrl: raw, isActive: true })
      .onConflictDoUpdate({
        target: [vturbPages.productSlug, vturbPages.pageUrl],
        set: { isActive: true, rawExampleUrl: raw, updatedAt: new Date() },
      });
  }

  const pages = await db.select().from(vturbPages)
    .where(and(eq(vturbPages.productSlug, slug), eq(vturbPages.isActive, true)));

  for (const page of pages) {
    try {
      const existingManual = await db.select().from(vturbPagePlayers)
        .where(and(eq(vturbPagePlayers.pageId, page.id), eq(vturbPagePlayers.source, "manual")));
      const hasManual = existingManual.length > 0;

      const mapping = await resolvePageMapping({ pageUrl: page.pageUrl, hasManual }, fetchImpl);

      let playerIds: string[];
      if (mapping.skipped) {
        playerIds = existingManual.map((m) => m.playerId);
      } else {
        const { scrape } = mapping;
        await db.update(vturbPages).set({
          scrapeStatus: scrape.status, lastHttpStatus: scrape.httpStatus, lastScrapedAt: new Date(), updatedAt: new Date(),
        }).where(eq(vturbPages.id, page.id));
        if (scrape.status === "no_embed") result.pagesNoEmbed++;
        if (scrape.status === "http_error") result.pagesHttpError++;
        await db.delete(vturbPagePlayers)
          .where(and(eq(vturbPagePlayers.pageId, page.id), eq(vturbPagePlayers.source, "auto")));
        for (const pid of scrape.players) {
          await db.insert(vturbPagePlayers).values({ pageId: page.id, playerId: pid, source: "auto" })
            .onConflictDoNothing();
        }
        playerIds = scrape.players;
      }
      playerIds = playerIds.filter((id) => playerById.has(id));
      if (playerIds.length === 0) continue;
      result.pagesMapped++;

      const perDay = new Map<string, PlayerDayInput[]>();
      const perDayCurves = new Map<string, CurveBucket[][]>();
      for (const pid of playerIds) {
        const meta = playerById.get(pid)!;
        const stats = await deps.client.sessionStatsByDay({ playerId: pid, startDate: deps.range.from, endDate: deps.range.to });
        for (const s of stats) {
          const input: PlayerDayInput = {
            views: s.views, plays: s.plays, finished: s.finished, clicks: s.clicks,
            overPitch: s.overPitch, underPitch: s.underPitch, engagementRate: s.engagementRate,
            durationSec: meta.durationSec, pitchTimeSec: meta.pitchTimeSec,
          };
          if (!perDay.has(s.date)) perDay.set(s.date, []);
          perDay.get(s.date)!.push(input);
        }
        for (const s of stats) {
          const eng = await deps.client.userEngagement({ playerId: pid, videoDuration: meta.durationSec, startDate: s.date, endDate: s.date });
          const curve = normalizeCurve(eng.groupedTimed, meta.durationSec);
          if (!perDayCurves.has(s.date)) perDayCurves.set(s.date, []);
          perDayCurves.get(s.date)!.push(curve);
        }
        await sleep(150);
      }

      for (const [day, inputs] of perDay) {
        const agg = aggregatePageDay(inputs);
        await db.insert(vturbPageDaily).values({
          pageId: page.id, date: day, views: agg.views, plays: agg.plays, finished: agg.finished,
          clicks: agg.clicks, overPitch: agg.overPitch, underPitch: agg.underPitch,
          avgWatchedSec: String(agg.avgWatchedSec), engagementRate: String(agg.engagementRate),
          playRate: String(agg.playRate),
          pitchRetentionRate: agg.pitchRetentionRate === null ? null : String(agg.pitchRetentionRate),
          raw: { players: inputs },
        }).onConflictDoUpdate({
          target: [vturbPageDaily.pageId, vturbPageDaily.date],
          set: {
            views: agg.views, plays: agg.plays, finished: agg.finished, clicks: agg.clicks,
            overPitch: agg.overPitch, underPitch: agg.underPitch, avgWatchedSec: String(agg.avgWatchedSec),
            engagementRate: String(agg.engagementRate), playRate: String(agg.playRate),
            pitchRetentionRate: agg.pitchRetentionRate === null ? null : String(agg.pitchRetentionRate),
            raw: { players: inputs }, updatedAt: new Date(),
          },
        });
        result.daysWritten++;

        const curves = perDayCurves.get(day) ?? [];
        const merged = mergeCurves(curves);
        const firstPlayer = playerById.get(playerIds[0])!;
        const pitchPct = firstPlayer.pitchTimeSec > 0 && firstPlayer.durationSec > 0
          ? (firstPlayer.pitchTimeSec / firstPlayer.durationSec) * 100 : null;
        await db.insert(vturbRetentionDaily).values({
          pageId: page.id, date: day, durationSec: firstPlayer.durationSec,
          pitchPct: pitchPct === null ? null : String(pitchPct), curve: merged,
        }).onConflictDoUpdate({
          target: [vturbRetentionDaily.pageId, vturbRetentionDaily.date],
          set: { durationSec: firstPlayer.durationSec, pitchPct: pitchPct === null ? null : String(pitchPct), curve: merged, updatedAt: new Date() },
        });
      }
    } catch (e) {
      console.error(`[syncVturb] página ${page.pageUrl} falhou:`, e);
    }
  }

  return result;
}
