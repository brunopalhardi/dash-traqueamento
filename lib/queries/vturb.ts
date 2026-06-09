// lib/queries/vturb.ts
import { and, eq, gte, lte, sql, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { vturbPages, vturbPageDaily, vturbRetentionDaily, vturbPagePlayers, vturbPlayers } from "@/lib/schema/vturb";
import { mergeCurves } from "@/lib/vturb/aggregate";
import type { CurveBucket } from "@/lib/vturb/types";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

export interface PageVideoRow {
  pageId: number;
  pageUrl: string;
  rawExampleUrl: string | null;
  scrapeStatus: string;
  lastHttpStatus: number | null;
  views: number;
  plays: number;
  playRate: number;
  engagementRate: number;
  avgWatchedSec: number;
  pitchRetentionRate: number | null;
}

/** Métricas de vídeo agregadas por página ativa no range. Junta com gasto/venda do Meta no caller (page.tsx) por URL normalizada. */
export async function getActivePagesWithVideo(slug: ProductSlug, range: DateRange): Promise<PageVideoRow[]> {
  const rows = await db
    .select({
      pageId: vturbPages.id,
      pageUrl: vturbPages.pageUrl,
      rawExampleUrl: vturbPages.rawExampleUrl,
      scrapeStatus: vturbPages.scrapeStatus,
      lastHttpStatus: vturbPages.lastHttpStatus,
      views: sql<number>`coalesce(sum(${vturbPageDaily.views}),0)::int`,
      plays: sql<number>`coalesce(sum(${vturbPageDaily.plays}),0)::int`,
      overPitch: sql<number>`coalesce(sum(${vturbPageDaily.overPitch}),0)::int`,
      underPitch: sql<number>`coalesce(sum(${vturbPageDaily.underPitch}),0)::int`,
      // tempo médio e engajamento ponderados por plays no range
      watchedXplays: sql<number>`coalesce(sum(${vturbPageDaily.avgWatchedSec} * ${vturbPageDaily.plays}),0)::float`,
      engXplays: sql<number>`coalesce(sum(${vturbPageDaily.engagementRate} * ${vturbPageDaily.plays}),0)::float`,
      anyPitch: sql<boolean>`bool_or(${vturbPageDaily.pitchRetentionRate} is not null)`,
    })
    .from(vturbPages)
    .leftJoin(vturbPageDaily, and(
      eq(vturbPageDaily.pageId, vturbPages.id),
      gte(vturbPageDaily.date, range.from),
      lte(vturbPageDaily.date, range.to),
    ))
    .where(and(eq(vturbPages.productSlug, slug), eq(vturbPages.isActive, true)))
    .groupBy(vturbPages.id);

  return rows.map((r) => {
    const plays = Number(r.plays);
    const over = Number(r.overPitch);
    const under = Number(r.underPitch);
    return {
      pageId: r.pageId,
      pageUrl: r.pageUrl,
      rawExampleUrl: r.rawExampleUrl,
      scrapeStatus: r.scrapeStatus,
      lastHttpStatus: r.lastHttpStatus,
      views: Number(r.views),
      plays,
      playRate: Number(r.views) > 0 ? (plays / Number(r.views)) * 100 : 0,
      engagementRate: plays > 0 ? Number(r.engXplays) / plays : 0,
      avgWatchedSec: plays > 0 ? Number(r.watchedXplays) / plays : 0,
      pitchRetentionRate: r.anyPitch ? (over + under > 0 ? (over / (over + under)) * 100 : 0) : null,
    };
  });
}

export interface PageRetention {
  pageUrl: string;
  durationSec: number;
  pitchPct: number | null;
  /** % de audiência por bucket de % do vídeo */
  curve: { pct: number; audiencePct: number }[];
  dailyEngagement: { date: string; engagementRate: number; avgWatchedSec: number }[];
}

export async function getPageRetention(pageId: number, range: DateRange): Promise<PageRetention | null> {
  const [page] = await db.select().from(vturbPages).where(eq(vturbPages.id, pageId));
  if (!page) return null;

  const retRows = await db.select().from(vturbRetentionDaily).where(and(
    eq(vturbRetentionDaily.pageId, pageId),
    gte(vturbRetentionDaily.date, range.from),
    lte(vturbRetentionDaily.date, range.to),
  ));
  const curves = retRows.map((r) => r.curve as CurveBucket[]).filter((c) => c.length === 101);
  const merged = curves.length ? mergeCurves(curves) : [];
  const base = merged[0]?.users ?? 0;
  const curve = merged.map((b) => ({ pct: b.pct, audiencePct: base > 0 ? (b.users / base) * 100 : 0 }));

  const durationSec = retRows[0]?.durationSec ?? 0;
  const pitchPct = retRows[0]?.pitchPct != null ? Number(retRows[0].pitchPct) : null;

  const daily = await db.select({
    date: vturbPageDaily.date,
    engagementRate: vturbPageDaily.engagementRate,
    avgWatchedSec: vturbPageDaily.avgWatchedSec,
  }).from(vturbPageDaily).where(and(
    eq(vturbPageDaily.pageId, pageId),
    gte(vturbPageDaily.date, range.from),
    lte(vturbPageDaily.date, range.to),
  )).orderBy(asc(vturbPageDaily.date));

  return {
    pageUrl: page.pageUrl,
    durationSec,
    pitchPct,
    curve,
    dailyEngagement: daily.map((d) => ({
      date: d.date, engagementRate: Number(d.engagementRate), avgWatchedSec: Number(d.avgWatchedSec),
    })),
  };
}

/** Páginas ativas sem player mapeado (pro painel de mapeamento manual). */
export async function getUnmappedActivePages(slug: ProductSlug) {
  return db.select({
    pageId: vturbPages.id, pageUrl: vturbPages.pageUrl, rawExampleUrl: vturbPages.rawExampleUrl,
    scrapeStatus: vturbPages.scrapeStatus, lastHttpStatus: vturbPages.lastHttpStatus,
  }).from(vturbPages)
    .where(and(
      eq(vturbPages.productSlug, slug),
      eq(vturbPages.isActive, true),
      sql`not exists (select 1 from ${vturbPagePlayers} pp where pp.page_id = ${vturbPages.id})`,
    ));
}

/** Catálogo de players pro dropdown do mapeamento manual. */
export async function listVturbPlayers() {
  return db.select({ playerId: vturbPlayers.playerId, name: vturbPlayers.name }).from(vturbPlayers).orderBy(asc(vturbPlayers.name));
}
