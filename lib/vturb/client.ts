import type { GroupedTimed } from "./types";

const BASE = "https://analytics.vturb.net";
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const FETCH_TIMEOUT_MS = 30_000;

export interface VturbPlayer {
  playerId: string;
  name: string | null;
  durationSec: number;
  pitchTimeSec: number;
  createdAt: string | null;
}

export interface VturbDayStat {
  date: string;
  views: number;
  plays: number;
  finished: number;
  clicks: number;
  overPitch: number;
  underPitch: number;
  engagementRate: number;
}

export interface VturbEngagement {
  averageWatchedSec: number;
  groupedTimed: GroupedTimed[];
}

export interface VturbClient {
  listPlayers(): Promise<VturbPlayer[]>;
  sessionStatsByDay(a: { playerId: string; startDate: string; endDate: string }): Promise<VturbDayStat[]>;
  userEngagement(a: { playerId: string; videoDuration: number; startDate: string; endDate: string }): Promise<VturbEngagement>;
}

export interface VturbClientConfig {
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  tz?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function createVturbClient(cfg: VturbClientConfig): VturbClient {
  const doFetch = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tz = cfg.tz ?? "America/Sao_Paulo";
  const headers = {
    "X-Api-Token": cfg.token,
    "X-Api-Version": "v1",
    "Content-Type": "application/json",
  };

  async function request<T>(path: string, opts: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await doFetch(`${BASE}${path}`, {
          method: opts.method,
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.status === 401 || res.status === 403) {
          throw new Error(`VTurb auth error (${res.status})`);
        }
        if (res.status === 429 || res.status >= 500) {
          if (attempt < RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
          throw new Error(`VTurb error ${res.status} após retries`);
        }
        const text = await res.text();
        return JSON.parse(text) as T;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (e instanceof Error && /auth/i.test(e.message)) throw e;
        if (attempt < RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("VTurb request falhou");
  }

  return {
    async listPlayers() {
      const raw = await request<Array<Record<string, unknown>>>("/players/list", { method: "GET" });
      return raw.map((p) => ({
        playerId: String(p.id),
        name: (p.name as string) ?? null,
        durationSec: num(p.duration),
        pitchTimeSec: num(p.pitch_time),
        createdAt: (p.created_at as string) ?? null,
      }));
    },
    async sessionStatsByDay({ playerId, startDate, endDate }) {
      const raw = await request<Array<Record<string, unknown>>>("/sessions/stats_by_day", {
        method: "POST",
        body: { player_id: playerId, start_date: `${startDate} 00:00:00`, end_date: `${endDate} 23:59:59`, timezone: tz },
      });
      return raw.map((r) => ({
        date: String(r.date_key ?? r.date),
        views: num(r.total_viewed),
        plays: num(r.total_started),
        finished: num(r.total_finished),
        clicks: num(r.total_clicked),
        overPitch: num(r.total_over_pitch),
        underPitch: num(r.total_under_pitch),
        engagementRate: num(r.engagement_rate),
      }));
    },
    async userEngagement({ playerId, videoDuration, startDate, endDate }) {
      const raw = await request<{ average_watched_time?: unknown; grouped_timed?: GroupedTimed[] }>(
        "/times/user_engagement",
        { method: "POST", body: { player_id: playerId, video_duration: videoDuration, start_date: `${startDate} 00:00:00`, end_date: `${endDate} 23:59:59`, timezone: tz } },
      );
      return {
        averageWatchedSec: num(raw.average_watched_time),
        groupedTimed: Array.isArray(raw.grouped_timed) ? raw.grouped_timed : [],
      };
    },
  };
}
