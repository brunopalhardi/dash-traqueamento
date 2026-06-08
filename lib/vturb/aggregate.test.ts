import { describe, it, expect } from "vitest";
import { aggregatePageDay, normalizeCurve, mergeCurves } from "./aggregate";
import type { PlayerDayInput } from "./types";

const base: PlayerDayInput = {
  views: 0, plays: 0, finished: 0, clicks: 0, overPitch: 0, underPitch: 0,
  engagementRate: 0, durationSec: 800, pitchTimeSec: 400,
};

describe("aggregatePageDay", () => {
  it("soma contagens e recalcula taxas a partir do total (não média de médias)", () => {
    const mobile: PlayerDayInput = { ...base, views: 100, plays: 40, overPitch: 5, underPitch: 35, engagementRate: 10, durationSec: 800 };
    const desktop: PlayerDayInput = { ...base, views: 100, plays: 60, overPitch: 20, underPitch: 40, engagementRate: 20, durationSec: 800 };
    const r = aggregatePageDay([mobile, desktop]);
    expect(r.views).toBe(200);
    expect(r.plays).toBe(100);
    expect(r.playRate).toBeCloseTo(50, 5);
    expect(r.engagementRate).toBeCloseTo(16, 5);
    expect(r.avgWatchedSec).toBeCloseTo(128, 5);
    expect(r.pitchRetentionRate).toBeCloseTo(25, 5);
  });

  it("pitchRetentionRate = null quando nenhum player tem pitch", () => {
    const p: PlayerDayInput = { ...base, views: 10, plays: 5, pitchTimeSec: 0 };
    expect(aggregatePageDay([p]).pitchRetentionRate).toBeNull();
  });

  it("não divide por zero (0 plays/views)", () => {
    const r = aggregatePageDay([{ ...base }]);
    expect(r.playRate).toBe(0);
    expect(r.avgWatchedSec).toBe(0);
    expect(r.engagementRate).toBe(0);
  });

  it("pitchRetentionRate = null quando pitch configurado mas sem dado (denom 0)", () => {
    const p = { ...base, views: 10, plays: 5, overPitch: 0, underPitch: 0, pitchTimeSec: 400 };
    expect(aggregatePageDay([p]).pitchRetentionRate).toBeNull();
  });
});

describe("normalizeCurve", () => {
  it("mapeia segundo→% do vídeo em 101 buckets (0..100)", () => {
    const gt = [{ timed: 0, total_users: 100 }, { timed: 400, total_users: 50 }, { timed: 800, total_users: 10 }];
    const c = normalizeCurve(gt, 800);
    expect(c).toHaveLength(101);
    expect(c[0]).toEqual({ pct: 0, users: 100 });
    expect(c[50]).toEqual({ pct: 50, users: 50 });
    expect(c[100]).toEqual({ pct: 100, users: 10 });
  });
  it("duração 0 → curva vazia (101 buckets zerados)", () => {
    expect(normalizeCurve([{ timed: 0, total_users: 5 }], 0).every((b) => b.users === 0)).toBe(true);
  });

  it("clampa timed acima da duração pro bucket 100", () => {
    const c = normalizeCurve([{ timed: 805, total_users: 7 }], 800);
    expect(c[100]).toEqual({ pct: 100, users: 7 });
  });
});

describe("mergeCurves", () => {
  it("soma users por bucket entre players", () => {
    const a = normalizeCurve([{ timed: 0, total_users: 100 }], 100);
    const b = normalizeCurve([{ timed: 0, total_users: 50 }], 100);
    expect(mergeCurves([a, b])[0]).toEqual({ pct: 0, users: 150 });
  });
});
