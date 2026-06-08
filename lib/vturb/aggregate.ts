import type { PlayerDayInput, PageDayAgg, CurveBucket, GroupedTimed } from "./types";

export function aggregatePageDay(players: PlayerDayInput[]): PageDayAgg {
  const sum = (f: (p: PlayerDayInput) => number) => players.reduce((s, p) => s + f(p), 0);
  const views = sum((p) => p.views);
  const plays = sum((p) => p.plays);
  const finished = sum((p) => p.finished);
  const clicks = sum((p) => p.clicks);
  const overPitch = sum((p) => p.overPitch);
  const underPitch = sum((p) => p.underPitch);

  const playWeighted = (f: (p: PlayerDayInput) => number) =>
    plays > 0 ? players.reduce((s, p) => s + f(p) * p.plays, 0) / plays : 0;

  // VTurb define engagement_rate ≈ tempo_assistido / duração * 100, então
  // avgWatchedSec = (engagementRate/100) * duração. Ponderado por plays.
  const engagementRate = playWeighted((p) => p.engagementRate);
  const avgWatchedSec = playWeighted((p) => (p.engagementRate / 100) * p.durationSec);

  const anyPitch = players.some((p) => p.pitchTimeSec > 0);
  const pitchDenom = overPitch + underPitch;
  const pitchRetentionRate = !anyPitch || pitchDenom === 0 ? null : (overPitch / pitchDenom) * 100;

  return {
    views, plays, finished, clicks, overPitch, underPitch,
    playRate: views > 0 ? (plays / views) * 100 : 0,
    engagementRate, avgWatchedSec, pitchRetentionRate,
  };
}

/** grouped_timed (segundo→users) → 101 buckets de % do vídeo. */
export function normalizeCurve(grouped: GroupedTimed[], durationSec: number): CurveBucket[] {
  const buckets: CurveBucket[] = Array.from({ length: 101 }, (_, pct) => ({ pct, users: 0 }));
  if (durationSec <= 0) return buckets;
  const sorted = [...grouped].sort((a, b) => a.timed - b.timed);
  for (const g of sorted) {
    const pct = Math.min(100, Math.max(0, Math.round((g.timed / durationSec) * 100)));
    buckets[pct] = { pct, users: g.total_users };
  }
  return buckets;
}

export function mergeCurves(curves: CurveBucket[][]): CurveBucket[] {
  return Array.from({ length: 101 }, (_, pct) => ({
    pct,
    users: curves.reduce((s, c) => s + (c[pct]?.users ?? 0), 0),
  }));
}
