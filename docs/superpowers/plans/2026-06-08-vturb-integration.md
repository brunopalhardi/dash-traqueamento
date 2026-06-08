# VTurb Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer métricas de vídeo do VTurb (tempo médio, play rate, engajamento, % no pitch + curva de retenção) por **página ativa do Guia**, vinculando página↔player via auto-scrape do embed, com snapshots diários.

**Architecture:** Cron diário `/api/sync/vturb` → `syncVturb()` em 4 passos (catálogo de players → descobrir páginas ativas via tabelas Meta → resolver player_id por scraping do HTML → puxar métricas da API VTurb e upsert em 5 tabelas novas). Queries juntam por URL normalizada com gasto/venda (Meta) já existentes. UI no `/guia`: card de páginas turbinado + drill-down `/guia/pagina/[pageId]` com curva de retenção + painel de mapeamento manual em settings.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM (Postgres/Supabase), Recharts, Vitest. Spec: `docs/superpowers/specs/2026-06-08-vturb-integration-design.md`.

---

## File Structure

**Novos:**
- `lib/vturb/scrape.ts` — `normalizePageUrl`, `extractPlayerIds`, `fetchPlayerIds`
- `lib/vturb/scrape.test.ts`
- `lib/vturb/aggregate.ts` — `aggregatePageDay`, `normalizeCurve`, `mergeCurves` (puro)
- `lib/vturb/aggregate.test.ts`
- `lib/vturb/client.ts` — `createVturbClient` (listPlayers, sessionStatsByDay, userEngagement)
- `lib/vturb/client.test.ts`
- `lib/vturb/types.ts` — tipos compartilhados
- `lib/schema/vturb.ts` — 5 tabelas
- `lib/sync/syncVturb.ts` — orquestração
- `lib/sync/syncVturb.test.ts`
- `app/api/sync/vturb/route.ts` — rota cron
- `lib/queries/vturb.ts` — `getActivePagesWithVideo`, `getPageRetention`, `getUnmappedActivePages`
- `components/dashboard/retention-curve.tsx` — gráfico Recharts
- `components/dashboard/pages-video-table.tsx` — tabela turbinada
- `app/(dashboard)/guia/pagina/[pageId]/page.tsx` — drill-down
- `app/(dashboard)/settings/integrations/_components/vturb-mapping.tsx` — mapeamento manual
- `app/api/vturb/map/route.ts` — POST pra gravar mapeamento manual

**Modificados:**
- `lib/schema/index.ts` — `export * from "./vturb"`
- `app/(dashboard)/guia/page.tsx` — buscar `getActivePagesWithVideo` e renderizar a tabela nova
- `vercel.json` — cron novo
- `.env.example` — documentar `VTURB_API_TOKEN`

**Convenções do repo a seguir:**
- Cliente HTTP espelha `lib/meta/client.ts` (retry com `RETRY_DELAYS_MS`, `FETCH_TIMEOUT_MS`, `sleep` injetável).
- Rota de sync espelha `app/api/sync/refresh/route.ts` (auth `CRON_SECRET` ou usuário; `maxDuration=300`).
- Migrations: `drizzle-kit generate` + `migrate`. **NUNCA `db:push` em prod** (dropa materialized views não declaradas).
- `VTURB_API_TOKEN` já está em `.env.local` (gitignored). Adicionar na Vercel e documentar em `Secret KEYs/tokens.md`.

---

## Task 1: URL normalization + extração de player_id (puro)

**Files:**
- Create: `lib/vturb/scrape.ts`
- Test: `lib/vturb/scrape.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// lib/vturb/scrape.test.ts
import { describe, it, expect } from "vitest";
import { normalizePageUrl, extractPlayerIds } from "./scrape";

describe("normalizePageUrl", () => {
  it("tira query string e UTM, mantém host+path", () => {
    expect(normalizePageUrl("https://guia-alzheimer-v1-a1.lovable.app/?utm_content=GA-A2"))
      .toBe("https://guia-alzheimer-v1-a1.lovable.app/");
  });
  it("normaliza barra final e força lowercase no host", () => {
    expect(normalizePageUrl("https://GUIA-X.lovable.app/pagina/"))
      .toBe("https://guia-x.lovable.app/pagina");
    expect(normalizePageUrl("https://guia-x.lovable.app"))
      .toBe("https://guia-x.lovable.app/");
  });
  it("retorna null pra URL inválida", () => {
    expect(normalizePageUrl(null)).toBeNull();
    expect(normalizePageUrl("não-é-url")).toBeNull();
  });
});

describe("extractPlayerIds", () => {
  it("extrai player_id do script converteai", () => {
    const html = `<script src="https://scripts.converteai.net/abc/players/6a13a0b8fdf7a4c849eb57ba/v4/player.js"></script>`;
    expect(extractPlayerIds(html)).toEqual(["6a13a0b8fdf7a4c849eb57ba"]);
  });
  it("extrai do custom element vid-<id>", () => {
    const html = `<vturb-smartplayer id="vid-6a18b5c19cc3b2039d5bd4b8"></vturb-smartplayer>`;
    expect(extractPlayerIds(html)).toEqual(["6a18b5c19cc3b2039d5bd4b8"]);
  });
  it("dedup quando script e element repetem o mesmo id", () => {
    const html = `<vturb-smartplayer id="vid-6a13a0b8fdf7a4c849eb57ba"></vturb-smartplayer>
      <script src="https://scripts.converteai.net/x/players/6a13a0b8fdf7a4c849eb57ba/v4/player.js"></script>`;
    expect(extractPlayerIds(html)).toEqual(["6a13a0b8fdf7a4c849eb57ba"]);
  });
  it("acha 2 players distintos (mobile+desktop)", () => {
    const html = `players/6a18b5c19cc3b2039d5bd4b8/v4 players/6a18b83a5f4238b9b9c8072d/v4`;
    expect(extractPlayerIds(html).sort()).toEqual(
      ["6a18b5c19cc3b2039d5bd4b8", "6a18b83a5f4238b9b9c8072d"].sort());
  });
  it("retorna vazio quando não há embed", () => {
    expect(extractPlayerIds("<html><body>sem player</body></html>")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/vturb/scrape.test.ts`
Expected: FAIL — "Cannot find module './scrape'".

- [ ] **Step 3: Implementar**

```typescript
// lib/vturb/scrape.ts

/** URL canônica de uma página: scheme+host(lower)+path, sem query/UTM, sem barra final (exceto raiz). */
export function normalizePageUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (path === "") path = "/";
    return `${u.protocol}//${host}${path}`;
  } catch {
    return null;
  }
}

const PLAYER_ID = "[a-f0-9]{24}";
const RE_SCRIPT = new RegExp(`converteai\\.net\\/[^"'\\s]*?\\/players\\/(${PLAYER_ID})`, "gi");
const RE_ELEMENT = new RegExp(`vid[-_](${PLAYER_ID})`, "gi");

/** Extrai player_id(s) do HTML cru de uma página com embed VTurb/ConverteAI. */
export function extractPlayerIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(RE_SCRIPT)) ids.add(m[1].toLowerCase());
  for (const m of html.matchAll(RE_ELEMENT)) ids.add(m[1].toLowerCase());
  return [...ids];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/vturb/scrape.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add lib/vturb/scrape.ts lib/vturb/scrape.test.ts
git commit -m "feat(vturb): normalização de URL + extração de player_id do embed"
```

---

## Task 2: Agregação mobile+desktop + curva (puro)

**Files:**
- Create: `lib/vturb/aggregate.ts`, `lib/vturb/types.ts`
- Test: `lib/vturb/aggregate.test.ts`

- [ ] **Step 1: Definir tipos compartilhados**

```typescript
// lib/vturb/types.ts

/** Métricas de um player num único dia (já parseadas pra número). */
export interface PlayerDayInput {
  views: number;
  plays: number;
  finished: number;
  clicks: number;
  overPitch: number;
  underPitch: number;
  /** engagement_rate em % (0-100) reportado pelo VTurb */
  engagementRate: number;
  durationSec: number;
  /** 0 = pitch não configurado no VTurb */
  pitchTimeSec: number;
}

/** Métricas agregadas de uma página num dia (soma dos players). */
export interface PageDayAgg {
  views: number;
  plays: number;
  finished: number;
  clicks: number;
  overPitch: number;
  underPitch: number;
  playRate: number;        // %
  engagementRate: number;  // %
  avgWatchedSec: number;
  /** null quando nenhum player da página tem pitch configurado */
  pitchRetentionRate: number | null;
}

/** Ponto da curva: % do vídeo (0-100, inteiro) → usuários. */
export interface CurveBucket {
  pct: number;
  users: number;
}

/** grouped_timed cru do endpoint /times/user_engagement */
export interface GroupedTimed {
  timed: number;       // segundo do vídeo
  total_users: number;
}
```

- [ ] **Step 2: Escrever o teste que falha**

```typescript
// lib/vturb/aggregate.test.ts
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
    expect(r.playRate).toBeCloseTo(50, 5);          // 100/200
    // engagement play-weighted: (10*40 + 20*60)/100 = 16
    expect(r.engagementRate).toBeCloseTo(16, 5);
    // avg watched play-weighted seg: (0.10*800*40 + 0.20*800*60)/100 = 128
    expect(r.avgWatchedSec).toBeCloseTo(128, 5);
    // pitch retention = over/(over+under) = 25/(25+75) = 25
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
});

describe("normalizeCurve", () => {
  it("mapeia segundo→% do vídeo em 101 buckets (0..100)", () => {
    const gt = [{ timed: 0, total_users: 100 }, { timed: 400, total_users: 50 }, { timed: 800, total_users: 10 }];
    const c = normalizeCurve(gt, 800);
    expect(c).toHaveLength(101);
    expect(c[0]).toEqual({ pct: 0, users: 100 });
    expect(c[50]).toEqual({ pct: 50, users: 50 });   // 400/800 = 50%
    expect(c[100]).toEqual({ pct: 100, users: 10 });
  });
  it("duração 0 → curva vazia (101 buckets zerados)", () => {
    expect(normalizeCurve([{ timed: 0, total_users: 5 }], 0).every((b) => b.users === 0)).toBe(true);
  });
});

describe("mergeCurves", () => {
  it("soma users por bucket entre players", () => {
    const a = normalizeCurve([{ timed: 0, total_users: 100 }], 100);
    const b = normalizeCurve([{ timed: 0, total_users: 50 }], 100);
    expect(mergeCurves([a, b])[0]).toEqual({ pct: 0, users: 150 });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run lib/vturb/aggregate.test.ts`
Expected: FAIL — "Cannot find module './aggregate'".

- [ ] **Step 4: Implementar**

```typescript
// lib/vturb/aggregate.ts
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

  const engagementRate = playWeighted((p) => p.engagementRate);
  const avgWatchedSec = playWeighted((p) => (p.engagementRate / 100) * p.durationSec);

  const anyPitch = players.some((p) => p.pitchTimeSec > 0);
  const pitchDenom = overPitch + underPitch;
  const pitchRetentionRate = !anyPitch ? null : pitchDenom > 0 ? (overPitch / pitchDenom) * 100 : 0;

  return {
    views, plays, finished, clicks, overPitch, underPitch,
    playRate: views > 0 ? (plays / views) * 100 : 0,
    engagementRate, avgWatchedSec, pitchRetentionRate,
  };
}

/** grouped_timed (segundo→users) → 101 buckets de % do vídeo. Pega o último users <= aquele %. */
export function normalizeCurve(grouped: GroupedTimed[], durationSec: number): CurveBucket[] {
  const buckets: CurveBucket[] = Array.from({ length: 101 }, (_, pct) => ({ pct, users: 0 }));
  if (durationSec <= 0) return buckets;
  const sorted = [...grouped].sort((a, b) => a.timed - b.timed);
  for (const g of sorted) {
    const pct = Math.round((g.timed / durationSec) * 100);
    if (pct >= 0 && pct <= 100) buckets[pct] = { pct, users: g.total_users };
  }
  return buckets;
}

export function mergeCurves(curves: CurveBucket[][]): CurveBucket[] {
  return Array.from({ length: 101 }, (_, pct) => ({
    pct,
    users: curves.reduce((s, c) => s + (c[pct]?.users ?? 0), 0),
  }));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run lib/vturb/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/vturb/aggregate.ts lib/vturb/types.ts lib/vturb/aggregate.test.ts
git commit -m "feat(vturb): agregação mobile+desktop e normalização da curva"
```

---

## Task 3: Schema das 5 tabelas

**Files:**
- Create: `lib/schema/vturb.ts`
- Modify: `lib/schema/index.ts`

- [ ] **Step 1: Criar o schema**

```typescript
// lib/schema/vturb.ts
import {
  pgTable, bigserial, bigint, text, integer, numeric, boolean, date, jsonb,
  timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import type { CurveBucket } from "@/lib/vturb/types";

export const vturbPlayers = pgTable("vturb_players", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  playerId: text("player_id").notNull().unique(),
  name: text("name"),
  durationSec: integer("duration_sec").notNull().default(0),
  pitchTimeSec: integer("pitch_time_sec").notNull().default(0),
  vturbCreatedAt: timestamp("vturb_created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vturbPages = pgTable(
  "vturb_pages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productSlug: text("product_slug").notNull().default("guia"),
    pageUrl: text("page_url").notNull(),
    rawExampleUrl: text("raw_example_url"),
    isActive: boolean("is_active").notNull().default(true),
    scrapeStatus: text("scrape_status").notNull().default("pending"), // pending|ok|no_embed|http_error
    lastHttpStatus: integer("last_http_status"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vturb_pages_product_url_uniq").on(t.productSlug, t.pageUrl)],
);

export const vturbPagePlayers = pgTable(
  "vturb_page_players",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: bigint("page_id", { mode: "number" })
      .notNull().references(() => vturbPages.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    source: text("source").notNull().default("auto"), // auto|manual
  },
  (t) => [uniqueIndex("vturb_page_players_uniq").on(t.pageId, t.playerId)],
);

export const vturbPageDaily = pgTable(
  "vturb_page_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: bigint("page_id", { mode: "number" })
      .notNull().references(() => vturbPages.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    views: integer("views").notNull().default(0),
    plays: integer("plays").notNull().default(0),
    finished: integer("finished").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    overPitch: integer("over_pitch").notNull().default(0),
    underPitch: integer("under_pitch").notNull().default(0),
    avgWatchedSec: numeric("avg_watched_sec", { precision: 10, scale: 2 }).notNull().default("0"),
    engagementRate: numeric("engagement_rate", { precision: 6, scale: 2 }).notNull().default("0"),
    playRate: numeric("play_rate", { precision: 6, scale: 2 }).notNull().default("0"),
    pitchRetentionRate: numeric("pitch_retention_rate", { precision: 6, scale: 2 }), // null se sem pitch
    raw: jsonb("raw").default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vturb_page_daily_uniq").on(t.pageId, t.date)],
);

export const vturbRetentionDaily = pgTable(
  "vturb_retention_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: bigint("page_id", { mode: "number" })
      .notNull().references(() => vturbPages.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    durationSec: integer("duration_sec").notNull().default(0),
    pitchPct: numeric("pitch_pct", { precision: 6, scale: 2 }), // null se sem pitch
    curve: jsonb("curve").$type<CurveBucket[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vturb_retention_daily_uniq").on(t.pageId, t.date)],
);
```

- [ ] **Step 2: Exportar no index**

Modify `lib/schema/index.ts` — adicionar ao final:

```typescript
export * from "./vturb";
```

- [ ] **Step 3: Gerar a migration**

Run: `npm run db:generate`
Expected: cria arquivo em `drizzle/` com `CREATE TABLE vturb_*`. Conferir que **só tem CREATE** (nenhum DROP de tabela existente).

- [ ] **Step 4: Aplicar a migration**

Run: `npm run db:migrate`
Expected: "migrations applied". Verificar no Supabase que as 5 tabelas existem.

- [ ] **Step 5: Commit**

```bash
git add lib/schema/vturb.ts lib/schema/index.ts drizzle/
git commit -m "feat(vturb): schema das 5 tabelas + migration"
```

---

## Task 4: Cliente da API VTurb

**Files:**
- Create: `lib/vturb/client.ts`
- Test: `lib/vturb/client.test.ts`

- [ ] **Step 1: Escrever o teste que falha (fetch mockado)**

```typescript
// lib/vturb/client.test.ts
import { describe, it, expect, vi } from "vitest";
import { createVturbClient } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status, ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe("createVturbClient", () => {
  it("listPlayers manda headers de auth e parseia", async () => {
    const fetchImpl = mockFetch(200, [
      { id: "6a13a0b8fdf7a4c849eb57ba", name: "Vsl V3", pitch_time: 520, duration: 862, created_at: "2026-05-25 01:07:04" },
    ]);
    const c = createVturbClient({ token: "TKN", fetchImpl, sleep: async () => {} });
    const players = await c.listPlayers();
    expect(players[0].playerId).toBe("6a13a0b8fdf7a4c849eb57ba");
    expect(players[0].durationSec).toBe(862);
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>)["X-Api-Token"]).toBe("TKN");
    expect((init.headers as Record<string, string>)["X-Api-Version"]).toBe("v1");
  });

  it("sessionStatsByDay parseia strings em número", async () => {
    const fetchImpl = mockFetch(200, [
      { date_key: "2026-06-01", total_viewed: 100, total_started: 40, total_finished: 2,
        total_clicked: 5, total_over_pitch: 5, total_under_pitch: 35, engagement_rate: "11.88", play_rate: "47.05" },
    ]);
    const c = createVturbClient({ token: "TKN", fetchImpl, sleep: async () => {} });
    const rows = await c.sessionStatsByDay({ playerId: "p", startDate: "2026-06-01", endDate: "2026-06-07" });
    expect(rows[0]).toMatchObject({ date: "2026-06-01", views: 100, plays: 40, engagementRate: 11.88 });
  });

  it("401 vira erro de auth", async () => {
    const fetchImpl = mockFetch(401, { error: "unauthorized" });
    const c = createVturbClient({ token: "BAD", fetchImpl, sleep: async () => {} });
    await expect(c.listPlayers()).rejects.toThrow(/auth/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/vturb/client.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// lib/vturb/client.ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/vturb/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/vturb/client.ts lib/vturb/client.test.ts
git commit -m "feat(vturb): cliente da Analytics API (players, stats_by_day, engagement)"
```

---

## Task 5: Scraper de página (fetch real do HTML)

**Files:**
- Modify: `lib/vturb/scrape.ts` (adicionar `fetchPlayerIds`)
- Modify: `lib/vturb/scrape.test.ts`

- [ ] **Step 1: Adicionar teste (fetch mockado)**

Acrescentar em `lib/vturb/scrape.test.ts`:

```typescript
import { fetchPlayerIds } from "./scrape";
import { vi } from "vitest";

describe("fetchPlayerIds", () => {
  it("retorna ok + players quando HTML tem embed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => `players/6a13a0b8fdf7a4c849eb57ba/v4/player.js`,
    } as Response);
    const r = await fetchPlayerIds("https://x.lovable.app/", fetchImpl);
    expect(r).toEqual({ status: "ok", httpStatus: 200, players: ["6a13a0b8fdf7a4c849eb57ba"] });
  });
  it("no_embed quando 200 sem player", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, text: async () => "<html></html>" } as Response);
    expect(await fetchPlayerIds("https://x.lovable.app/", fetchImpl)).toEqual({ status: "no_embed", httpStatus: 200, players: [] });
  });
  it("http_error quando 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404, text: async () => "not found" } as Response);
    expect(await fetchPlayerIds("https://x.lovable.app/", fetchImpl)).toEqual({ status: "http_error", httpStatus: 404, players: [] });
  });
  it("http_error quando fetch lança", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const r = await fetchPlayerIds("https://x.lovable.app/", fetchImpl);
    expect(r.status).toBe("http_error");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/vturb/scrape.test.ts`
Expected: FAIL — `fetchPlayerIds` não existe.

- [ ] **Step 3: Implementar**

Adicionar em `lib/vturb/scrape.ts`:

```typescript
export interface ScrapeResult {
  status: "ok" | "no_embed" | "http_error";
  httpStatus: number | null;
  players: string[];
}

const UA = "Mozilla/5.0 (compatible; TraqueamentoBot/1.0)";

export async function fetchPlayerIds(url: string, fetchImpl: typeof fetch = fetch): Promise<ScrapeResult> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetchImpl(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status < 200 || res.status >= 400) {
      return { status: "http_error", httpStatus: res.status, players: [] };
    }
    const html = await res.text();
    const players = extractPlayerIds(html);
    return { status: players.length ? "ok" : "no_embed", httpStatus: res.status, players };
  } catch {
    return { status: "http_error", httpStatus: null, players: [] };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/vturb/scrape.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/vturb/scrape.ts lib/vturb/scrape.test.ts
git commit -m "feat(vturb): fetch do HTML da página com classificação de saúde"
```

---

## Task 6: Orquestração `syncVturb`

**Files:**
- Create: `lib/sync/syncVturb.ts`
- Test: `lib/sync/syncVturb.test.ts`

- [ ] **Step 1: Escrever o teste (client + db mockados)**

```typescript
// lib/sync/syncVturb.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolvePageMapping } from "./syncVturb";
import type { VturbClient } from "@/lib/vturb/client";

describe("resolvePageMapping", () => {
  it("não raspa página que já tem mapeamento manual", async () => {
    const fetchSpy = vi.fn();
    const r = await resolvePageMapping(
      { pageUrl: "https://x.lovable.app/", hasManual: true },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toEqual({ skipped: true });
  });
  it("raspa e devolve players quando não tem manual", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, text: async () => "players/6a13a0b8fdf7a4c849eb57ba/v4" } as Response);
    const r = await resolvePageMapping({ pageUrl: "https://x.lovable.app/", hasManual: false }, fetchImpl);
    expect(r).toMatchObject({ skipped: false, scrape: { status: "ok", players: ["6a13a0b8fdf7a4c849eb57ba"] } });
  });
});
```

> Nota: `syncVturb` completo toca o banco (upserts) e é validado no Task 13 (backfill real + diag). O teste unitário cobre a lógica pura de decisão de mapeamento (`resolvePageMapping`), que é a parte com regra de negócio.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/sync/syncVturb.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
// lib/sync/syncVturb.ts
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { adInsightsDaily } from "@/lib/schema/insights";
import { ads, adsets, campaigns, adAccounts } from "@/lib/schema/meta";
import {
  vturbPlayers, vturbPages, vturbPagePlayers, vturbPageDaily, vturbRetentionDaily,
} from "@/lib/schema/vturb";
import { getProduct } from "@/lib/products";
import { normalizePageUrl, fetchPlayerIds, type ScrapeResult } from "@/lib/vturb/scrape";
import { aggregatePageDay, normalizeCurve, mergeCurves } from "@/lib/vturb/aggregate";
import type { VturbClient } from "@/lib/vturb/client";
import type { PlayerDayInput } from "@/lib/vturb/types";

export type VturbSyncMode = "daily" | "backfill" | "manual";

export interface SyncVturbDeps {
  db?: typeof defaultDb;
  client: VturbClient;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** range de datas a sincronizar (YYYY-MM-DD) */
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

  // ── Passo 1: catálogo de players ──
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

  // ── Passo 2: descobrir páginas ativas (URLs de anúncios ACTIVE do Guia) ──
  if (!product.metaAccountId) throw new Error("Produto sem metaAccountId");
  const adRows = await db
    .select({ landingUrl: ads.landingUrl })
    .from(ads)
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(adAccounts.metaAccountId, product.metaAccountId), eq(ads.status, "ACTIVE")));

  const activeUrls = new Map<string, string>(); // normalized → raw exemplo
  for (const r of adRows) {
    const norm = normalizePageUrl(r.landingUrl);
    if (norm && !activeUrls.has(norm)) activeUrls.set(norm, r.landingUrl!);
  }
  result.pagesActive = activeUrls.size;

  // marca páginas que saíram do ar como inativas
  await db.update(vturbPages).set({ isActive: false, updatedAt: new Date() })
    .where(eq(vturbPages.productSlug, slug));

  // upsert páginas ativas
  for (const [norm, raw] of activeUrls) {
    await db.insert(vturbPages).values({ productSlug: slug, pageUrl: norm, rawExampleUrl: raw, isActive: true })
      .onConflictDoUpdate({
        target: [vturbPages.productSlug, vturbPages.pageUrl],
        set: { isActive: true, rawExampleUrl: raw, updatedAt: new Date() },
      });
  }

  const pages = await db.select().from(vturbPages)
    .where(and(eq(vturbPages.productSlug, slug), eq(vturbPages.isActive, true)));

  // ── Passo 3 + 4 por página (isolado: erro numa não derruba as outras) ──
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
        // substitui mapeamentos auto anteriores
        await db.delete(vturbPagePlayers)
          .where(and(eq(vturbPagePlayers.pageId, page.id), eq(vturbPagePlayers.source, "auto")));
        for (const pid of scrape.players) {
          await db.insert(vturbPagePlayers).values({ pageId: page.id, playerId: pid, source: "auto" })
            .onConflictDoNothing();
        }
        playerIds = scrape.players;
      }
      // só players que existem no catálogo
      playerIds = playerIds.filter((id) => playerById.has(id));
      if (playerIds.length === 0) continue;
      result.pagesMapped++;

      // por dia: junta stats + curva de todos os players da página
      const perDay = new Map<string, PlayerDayInput[]>();
      const perDayCurves = new Map<string, ReturnType<typeof normalizeCurve>[]>();
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
        // curva por dia
        for (const s of stats) {
          const eng = await deps.client.userEngagement({ playerId: pid, videoDuration: meta.durationSec, startDate: s.date, endDate: s.date });
          const curve = normalizeCurve(eng.groupedTimed, meta.durationSec);
          if (!perDayCurves.has(s.date)) perDayCurves.set(s.date, []);
          perDayCurves.get(s.date)!.push(curve);
        }
        await sleep(150); // throttle leve
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
      // segue pra próxima
    }
  }

  return result;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/sync/syncVturb.test.ts`
Expected: PASS (`resolvePageMapping`).

- [ ] **Step 5: Type-check do módulo inteiro**

Run: `npx tsc --noEmit`
Expected: sem erros em `lib/vturb/*` e `lib/sync/syncVturb.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/syncVturb.ts lib/sync/syncVturb.test.ts
git commit -m "feat(vturb): orquestração do sync (catálogo, scrape, métricas, upsert)"
```

---

## Task 7: Rota cron + agendamento

**Files:**
- Create: `app/api/sync/vturb/route.ts`
- Modify: `vercel.json`, `.env.example`

- [ ] **Step 1: Criar a rota (espelha refresh)**

```typescript
// app/api/sync/vturb/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVturbClient } from "@/lib/vturb/client";
import { syncVturb, type VturbSyncMode } from "@/lib/sync/syncVturb";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

function parseMode(req: NextRequest): VturbSyncMode {
  const v = req.nextUrl.searchParams.get("mode");
  if (v === "backfill" || v === "manual" || v === "daily") return v;
  return "daily";
}

function rangeFor(mode: VturbSyncMode): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = mode === "backfill" ? 30 : 2; // daily re-sincroniza 2 dias
  from.setDate(to.getDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.VTURB_API_TOKEN;
  if (!token) return NextResponse.json({ error: "VTURB_API_TOKEN not set" }, { status: 500 });

  const mode = parseMode(req);
  const client = createVturbClient({ token });
  const result = await syncVturb({ client, range: rangeFor(mode) });
  return NextResponse.json(result);
}

export const GET = POST;
```

- [ ] **Step 2: Adicionar o cron no `vercel.json`**

Adicionar ao array `crons` (depois do Meta das 05h):

```json
{ "path": "/api/sync/vturb", "schedule": "0 8 * * *" }
```

- [ ] **Step 3: Documentar env no `.env.example`**

Adicionar linha: `VTURB_API_TOKEN=` (e em `Secret KEYs/tokens.md`, registrar o token real + setar na Vercel via dashboard).

- [ ] **Step 4: Build pra validar a rota**

Run: `npm run build`
Expected: compila; rota `/api/sync/vturb` aparece no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/sync/vturb/route.ts vercel.json .env.example
git commit -m "feat(vturb): rota cron /api/sync/vturb (08h UTC, após Meta)"
```

---

## Task 8: Queries de leitura

**Files:**
- Create: `lib/queries/vturb.ts`

- [ ] **Step 1: Implementar as queries**

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros em `lib/queries/vturb.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/vturb.ts
git commit -m "feat(vturb): queries de páginas com vídeo, retenção e não-mapeadas"
```

---

## Task 9: Componente da curva de retenção

**Files:**
- Create: `components/dashboard/retention-curve.tsx`

- [ ] **Step 1: Implementar (Recharts, segue padrão dos charts do repo)**

```tsx
// components/dashboard/retention-curve.tsx
"use client";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RetentionPoint { pct: number; audiencePct: number }

export function RetentionCurve({ curve, pitchPct }: { curve: RetentionPoint[]; pitchPct: number | null }) {
  if (curve.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Sem dados de retenção no período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={curve} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ret" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#202024" vertical={false} />
        <XAxis dataKey="pct" tickFormatter={(v) => `${v}%`} tick={{ fill: "#5f5f66", fontSize: 11 }}
          ticks={[0, 20, 40, 60, 80, 100]} stroke="#2a2a2e" />
        <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} tick={{ fill: "#5f5f66", fontSize: 11 }} stroke="#2a2a2e" />
        <Tooltip
          contentStyle={{ background: "#141416", border: "1px solid #2a2a2e", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => `${v}% do vídeo`}
          formatter={(v: number) => [`${v.toFixed(1)}% da audiência`, "retenção"]}
        />
        {pitchPct != null && (
          <ReferenceLine x={Math.round(pitchPct)} stroke="#7c6cf6" strokeDasharray="5 4"
            label={{ value: "pitch", fill: "#7c6cf6", fontSize: 11, position: "top" }} />
        )}
        <Area type="monotone" dataKey="audiencePct" stroke="#f59e0b" strokeWidth={2} fill="url(#ret)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/retention-curve.tsx
git commit -m "feat(vturb): componente da curva de retenção"
```

---

## Task 10: Tabela de páginas com vídeo + wiring no /guia

**Files:**
- Create: `components/dashboard/pages-video-table.tsx`
- Modify: `app/(dashboard)/guia/page.tsx`

- [ ] **Step 1: Criar a tabela**

```tsx
// components/dashboard/pages-video-table.tsx
import Link from "next/link";
import { fmt } from "./format";

export interface PageVideoTableRow {
  pageId: number;
  host: string;
  path: string;
  health: "ok" | "no_embed" | "http_error";
  lastHttpStatus: number | null;
  spend: number;
  purchase: number;
  avgWatchedSec: number;
  playRate: number;
  engagementRate: number;
  pitchRetentionRate: number | null;
  hasVideo: boolean;
}

function mmss(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Badge({ health, status }: { health: PageVideoTableRow["health"]; status: number | null }) {
  const map = {
    ok: { c: "bg-emerald-400", t: "mapeado" },
    no_embed: { c: "bg-amber-400", t: "sem player — mapear manual" },
    http_error: { c: "bg-rose-400", t: `página quebrada${status ? ` (${status})` : ""}` },
  }[health];
  return <span className="inline-flex items-center gap-2" title={map.t}><span className={`h-2 w-2 rounded-full ${map.c}`} /></span>;
}

export function PagesVideoTable({ rows }: { rows: PageVideoTableRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem páginas ativas no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
            <th className="text-left py-3 px-3 font-medium">Página</th>
            <th className="text-right py-3 px-3 font-medium">Gasto</th>
            <th className="text-right py-3 px-3 font-medium">Vendas*</th>
            <th className="text-right py-3 px-3 font-medium">CPA</th>
            <th className="text-right py-3 px-3 font-medium">Tempo médio</th>
            <th className="text-right py-3 px-3 font-medium">Play rate</th>
            <th className="text-right py-3 px-3 font-medium">Engaj.</th>
            <th className="text-right py-3 px-3 font-medium">% pitch</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r) => (
            <tr key={r.pageId} className="border-t border-border/40 hover:bg-white/[0.02]">
              <td className="py-3 px-3">
                <Link href={`/guia/pagina/${r.pageId}`} className="flex items-center gap-2 group">
                  <Badge health={r.health} status={r.lastHttpStatus} />
                  <span>
                    <span className="text-foreground group-hover:underline">{r.host}</span>
                    <span className="block text-[11px] text-muted-foreground/60">{r.path}</span>
                  </span>
                </Link>
              </td>
              <td className="text-right px-3">{fmt.money(r.spend)}</td>
              <td className="text-right px-3">{fmt.int(r.purchase)}</td>
              <td className="text-right px-3">{r.purchase > 0 ? fmt.money(r.spend / r.purchase) : "—"}</td>
              <td className="text-right px-3">{r.hasVideo ? mmss(r.avgWatchedSec) : "—"}</td>
              <td className="text-right px-3">{r.hasVideo ? fmt.pct1(r.playRate) : "—"}</td>
              <td className="text-right px-3">{r.hasVideo ? fmt.pct1(r.engagementRate) : "—"}</td>
              <td className="text-right px-3">{r.pitchRetentionRate != null ? fmt.pct1(r.pitchRetentionRate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground/60 mt-3">
        🟢 mapeado · 🟡 sem player (mapear em settings) · 🔴 página quebrada · <b>* vendas = pixel do Meta</b> (compara páginas; KPIs do topo seguem Hotmart).
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Wire no `/guia/page.tsx`**

No `app/(dashboard)/guia/page.tsx`: importar `getActivePagesWithVideo` de `@/lib/queries/vturb` e `getPageFunnel` de `@/lib/queries/funnel`, `normalizePageUrl` de `@/lib/vturb/scrape`, `PagesVideoTable`. Adicionar às chamadas do `Promise.all`:

```typescript
import { getActivePagesWithVideo } from "@/lib/queries/vturb";
import { getPageFunnel } from "@/lib/queries/funnel";
import { normalizePageUrl } from "@/lib/vturb/scrape";
import { PagesVideoTable, type PageVideoTableRow } from "@/components/dashboard/pages-video-table";
```

Adicionar no `Promise.all` (sempre `onlyActive: true` pra essa tabela):

```typescript
const [/* ...existentes..., */ videoPages, pageFunnelActive] = await Promise.all([
  /* ...existentes..., */
  getActivePagesWithVideo("guia", currentRange),
  getPageFunnel("guia", currentRange, { onlyActive: true }),
]);
```

Montar as linhas juntando vídeo (VTurb, por URL normalizada) com gasto/venda (Meta):

```typescript
const spendByUrl = new Map<string, { spend: number; purchase: number }>();
for (const p of pageFunnelActive) {
  const norm = normalizePageUrl(p.landingUrl);
  if (!norm) continue;
  const cur = spendByUrl.get(norm) ?? { spend: 0, purchase: 0 };
  cur.spend += p.spend; cur.purchase += p.purchase;
  spendByUrl.set(norm, cur);
}
const pageRows: PageVideoTableRow[] = videoPages.map((v) => {
  const u = new URL(v.pageUrl);
  const money = spendByUrl.get(v.pageUrl) ?? { spend: 0, purchase: 0 };
  return {
    pageId: v.pageId,
    host: u.hostname,
    path: u.pathname,
    health: v.scrapeStatus === "ok" ? "ok" : v.scrapeStatus === "http_error" ? "http_error" : "no_embed",
    lastHttpStatus: v.lastHttpStatus,
    spend: money.spend, purchase: money.purchase,
    avgWatchedSec: v.avgWatchedSec, playRate: v.playRate, engagementRate: v.engagementRate,
    pitchRetentionRate: v.pitchRetentionRate, hasVideo: v.plays > 0,
  };
}).sort((a, b) => b.spend - a.spend);
```

Renderizar um Card novo (depois do card "Detalhamento por página de destino"):

```tsx
<Card className="bg-card border-border/60 mb-6">
  <CardHeader>
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Páginas ativas · vídeo (VSL)
    </CardTitle>
  </CardHeader>
  <CardContent>
    <PagesVideoTable rows={pageRows} />
  </CardContent>
</Card>
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npm run lint`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/pages-video-table.tsx "app/(dashboard)/guia/page.tsx"
git commit -m "feat(vturb): tabela de páginas ativas com métricas de vídeo no /guia"
```

---

## Task 11: Drill-down `/guia/pagina/[pageId]`

**Files:**
- Create: `app/(dashboard)/guia/pagina/[pageId]/page.tsx`

- [ ] **Step 1: Implementar a página (espelha `/guia/criativo/[adId]`)**

```tsx
// app/(dashboard)/guia/pagina/[pageId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPageRetention } from "@/lib/queries/vturb";
import { parseRangeFromSearchParams } from "@/lib/utils/date-ranges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RetentionCurve } from "@/components/dashboard/retention-curve";
import { fmt } from "@/components/dashboard/format";

export const dynamic = "force-dynamic";

function mmss(sec: number): string {
  if (!sec || sec <= 0) return "—";
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

export default async function PaginaDetail({
  params, searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ preset?: string; start?: string; end?: string }>;
}) {
  const { pageId } = await params;
  const sp = await searchParams;
  const { range } = parseRangeFromSearchParams(sp);
  const data = await getPageRetention(Number(pageId), range);
  if (!data) notFound();

  const lastAvg = data.dailyEngagement.at(-1)?.avgWatchedSec ?? 0;

  return (
    <>
      <Link href="/guia" className="font-mono text-xs text-muted-foreground hover:text-foreground">← Páginas ativas</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{data.pageUrl}</h1>
      <p className="font-mono text-xs text-muted-foreground mb-6">
        duração {mmss(data.durationSec)}{data.pitchPct != null ? ` · pitch em ${data.pitchPct.toFixed(0)}%` : " · pitch não configurado"}
      </p>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Curva de retenção · % da audiência ao longo do vídeo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RetentionCurve curve={data.curve} pitchPct={data.pitchPct} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Evolução diária · tempo médio (último: {mmss(lastAvg)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm font-mono">
            <thead><tr className="text-[10px] uppercase text-muted-foreground/70">
              <th className="text-left py-2">Dia</th><th className="text-right">Tempo médio</th><th className="text-right">Engaj.</th>
            </tr></thead>
            <tbody>
              {data.dailyEngagement.map((d) => (
                <tr key={d.date} className="border-t border-border/40">
                  <td className="py-2">{fmt.shortDate(d.date)}</td>
                  <td className="text-right">{mmss(d.avgWatchedSec)}</td>
                  <td className="text-right">{fmt.pct1(d.engagementRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: rota `/guia/pagina/[pageId]` compila.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/guia/pagina"
git commit -m "feat(vturb): drill-down de página com curva de retenção"
```

---

## Task 12: Mapeamento manual em settings

**Files:**
- Create: `app/api/vturb/map/route.ts`, `app/(dashboard)/settings/integrations/_components/vturb-mapping.tsx`
- Modify: `app/(dashboard)/settings/integrations/page.tsx`

- [ ] **Step 1: Rota POST pra gravar mapeamento manual**

```typescript
// app/api/vturb/map/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { vturbPagePlayers } from "@/lib/schema/vturb";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { pageId, playerId } = await req.json();
  if (!pageId || !playerId) return NextResponse.json({ error: "pageId e playerId obrigatórios" }, { status: 400 });

  // remove mapeamentos auto da página e grava o manual
  await db.delete(vturbPagePlayers).where(and(eq(vturbPagePlayers.pageId, Number(pageId)), eq(vturbPagePlayers.source, "auto")));
  await db.insert(vturbPagePlayers).values({ pageId: Number(pageId), playerId, source: "manual" }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Componente client do painel**

```tsx
// app/(dashboard)/settings/integrations/_components/vturb-mapping.tsx
"use client";
import { useState } from "react";

interface UnmappedPage { pageId: number; pageUrl: string; scrapeStatus: string }
interface PlayerOpt { playerId: string; name: string | null }

export function VturbMapping({ pages, players }: { pages: UnmappedPage[]; players: PlayerOpt[] }) {
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  if (pages.length === 0) {
    return <p className="text-sm text-muted-foreground">Todas as páginas ativas estão mapeadas. ✅</p>;
  }
  async function save(pageId: number, playerId: string) {
    const res = await fetch("/api/vturb/map", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, playerId }),
    });
    if (res.ok) setSaved((s) => ({ ...s, [pageId]: true }));
  }
  return (
    <div className="space-y-3">
      {pages.map((p) => (
        <div key={p.pageId} className="flex items-center gap-3 text-sm">
          <span className="font-mono text-xs flex-1 truncate">{p.pageUrl}</span>
          <select className="bg-card border border-border rounded px-2 py-1 text-xs"
            defaultValue="" onChange={(e) => e.target.value && save(p.pageId, e.target.value)}>
            <option value="" disabled>escolher player…</option>
            {players.map((pl) => <option key={pl.playerId} value={pl.playerId}>{pl.name ?? pl.playerId}</option>)}
          </select>
          {saved[p.pageId] && <span className="text-emerald-400 text-xs">salvo ✓</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Renderizar no settings**

Em `app/(dashboard)/settings/integrations/page.tsx`: importar `getUnmappedActivePages`, `listVturbPlayers` de `@/lib/queries/vturb` e `VturbMapping`. Buscar os dois e renderizar num card novo:

```tsx
import { getUnmappedActivePages, listVturbPlayers } from "@/lib/queries/vturb";
import { VturbMapping } from "./_components/vturb-mapping";
// dentro do componente async:
const [unmapped, vplayers] = await Promise.all([getUnmappedActivePages("guia"), listVturbPlayers()]);
// no JSX:
<Card>
  <CardHeader><CardTitle>VTurb · páginas sem player</CardTitle></CardHeader>
  <CardContent><VturbMapping pages={unmapped} players={vplayers} /></CardContent>
</Card>
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: compila.

- [ ] **Step 5: Commit**

```bash
git add app/api/vturb/map "app/(dashboard)/settings/integrations"
git commit -m "feat(vturb): mapeamento manual de página→player em settings"
```

---

## Task 13: Backfill, verificação e deploy

**Files:** nenhum (operacional)

- [ ] **Step 1: Suite completa de testes**

Run: `npm run test`
Expected: todos passam (incl. `lib/vturb/*`).

- [ ] **Step 2: Backfill local (30 dias) via tsx**

Criar `scripts/run-vturb-backfill.ts`:

```typescript
import { config } from "dotenv";
config({ path: ".env.local" });
import { createVturbClient } from "@/lib/vturb/client";
import { syncVturb } from "@/lib/sync/syncVturb";

(async () => {
  const client = createVturbClient({ token: process.env.VTURB_API_TOKEN! });
  const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 29);
  const r = await syncVturb({ client, range: { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) } });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})();
```

Run: `DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/run-vturb-backfill.ts`
Expected: JSON com `pagesActive > 0`, `pagesMapped > 0`, `daysWritten > 0`. Conferir `pagesNoEmbed`/`pagesHttpError` batem com o esperado (d1-a no_embed).

- [ ] **Step 3: Verificar dados no banco**

Conferir via diag (adaptar `scripts/diag-vturb-poc.ts`) ou Drizzle Studio (`npm run db:studio`) que `vturb_page_daily` e `vturb_retention_daily` têm linhas e que o tempo médio do `v1-a1` bate com o PoC (~1:42 / engaj ~11,9%).

- [ ] **Step 4: Setar `VTURB_API_TOKEN` na Vercel**

Via dashboard Vercel → Environment Variables (Production). Documentar em `Secret KEYs/tokens.md`.

- [ ] **Step 5: Commit + push (deploy)**

```bash
git add docs/superpowers/plans/2026-06-08-vturb-integration.md
git commit -m "feat(vturb): integração completa — retenção de VSL por página no /guia"
git push origin main
```

Expected: Vercel builda; após deploy, `/guia` mostra o card "Páginas ativas · vídeo" e o cron `/api/sync/vturb` aparece agendado.

- [ ] **Step 6: Smoke test em produção**

Abrir `/guia` logado → conferir tabela de páginas com métricas de vídeo; clicar numa página → curva de retenção renderiza com a linha do pitch; `/settings/integrations` → painel de páginas não-mapeadas funciona.

---

## Self-Review

**Cobertura do spec:**
- Modelo de dados (5 tabelas) → Task 3 ✓
- Auto-scrape + fallback manual → Tasks 1, 5, 6, 12 ✓
- URL normalizada como chave → Task 1 + uso em 6, 10 ✓
- Soma mobile+desktop, recalcula taxas → Task 2 ✓
- Curva normalizada em % + histórico diário → Tasks 2, 6, 8 ✓
- Métricas (tempo médio, play rate, engaj, %pitch) → Tasks 2, 8, 10 ✓
- pitch_time=0 → "—" → Tasks 2, 8, 10 ✓
- Saúde (404/no_embed) → Tasks 5, 6, 10 ✓
- Venda por página = pixel Meta (rotulado) → Task 10 ✓
- Sync diário após Meta + idempotente + isolado + throttle → Tasks 6, 7 ✓
- UI: turbinar página + drill-down + mapeamento manual → Tasks 10, 11, 12 ✓
- Testes (extractPlayerIds, normalização, agregação, curva, parser, sync) → Tasks 1, 2, 4, 5, 6 ✓
- Trabalho futuro (UTM) → fora do plano (tarefa #8 da sessão) ✓

**Consistência de tipos:** `PlayerDayInput`/`PageDayAgg`/`CurveBucket`/`GroupedTimed` definidos em Task 2 (`lib/vturb/types.ts`) e reusados em 4, 6, 8. `VturbClient`/`VturbPlayer`/`VturbDayStat` em Task 4, reusados em 6, 7. `ScrapeResult` em Task 5, reusado em 6. `PageVideoRow`/`PageRetention` em Task 8, reusados em 10, 11.

**Nota de divergência do mockup:** o mockup mostrou a tabela como "turbinar o card existente". O plano cria um **card/componente novo** (`PagesVideoTable`) ao lado do existente — mais limpo que reescrever o `FunnelTablePage` (que tem layout de funil pós-clique diferente). Mesma informação, sem regressão no card atual. Se preferir fundir num só, é ajuste de UI posterior.
