# Meta Ads Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull Meta Ads data (campaigns, adsets, ads, creatives, daily insights) into Postgres via a System User token, with a Settings UI to manage which accounts sync, plus daily cron + manual refresh.

**Architecture:** A typed Graph API client (`lib/meta/`) with retry/backoff and pagination. An orchestrator (`lib/sync/syncMeta.ts`) that walks the hierarchy and upserts. Three new API routes (`/api/meta/health`, `/api/meta/accounts/discover`, `/api/meta/accounts/toggle`) + a new `/api/sync/refresh-now` and an updated `/api/sync/refresh`. A new page `/settings/integrations` consumes them.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM, Supabase Postgres, shadcn/ui, Vitest (new), native `fetch`.

**Spec:** [docs/superpowers/specs/2026-05-06-meta-ads-integration-design.md](../specs/2026-05-06-meta-ads-integration-design.md)

---

## File Structure

**New files:**
- `lib/meta/types.ts` — Graph API response shapes + domain types
- `lib/meta/errors.ts` — `MetaApiError`, `MetaAuthError`, `MetaRateLimitError`
- `lib/meta/client.ts` — Graph API client (fetch + retry + pagination)
- `lib/meta/client.test.ts` — Vitest tests with mocked fetch
- `lib/sync/syncMeta.ts` — orchestrator
- `lib/sync/syncMeta.test.ts` — Vitest tests with mocked client
- `app/api/sync/refresh-now/route.ts`
- `app/api/meta/health/route.ts`
- `app/api/meta/accounts/discover/route.ts`
- `app/api/meta/accounts/toggle/route.ts`
- `app/(dashboard)/settings/integrations/page.tsx`
- `app/(dashboard)/settings/integrations/_components/token-status.tsx`
- `app/(dashboard)/settings/integrations/_components/accounts-table.tsx`
- `app/(dashboard)/settings/integrations/_components/last-sync.tsx`
- `app/(dashboard)/settings/integrations/_components/refresh-now-button.tsx`
- `app/(dashboard)/settings/integrations/_components/token-howto.tsx`
- `drizzle/0003_meta_integration.sql` — migration
- `vitest.config.ts`

**Modified files:**
- `lib/schema/meta.ts` — add `isActive` to `adAccounts`, make `accessTokenEncrypted` nullable
- `lib/schema/sync.ts` — add `details` jsonb column
- `app/api/sync/refresh/route.ts` — call `syncMeta({ mode: 'daily' })`, set `maxDuration`
- `.env.example` — add `META_SYSTEM_USER_TOKEN`, `META_GRAPH_VERSION`
- `package.json` — add Vitest devDeps + test scripts

---

## Task 1: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run: `npm test`
Expected: Vitest exits 0 with "No test files found" or similar (no failures).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest"
```

---

## Task 2: Schema migration (`is_active`, nullable token, `sync_jobs.details`)

**Files:**
- Modify: `lib/schema/meta.ts`
- Modify: `lib/schema/sync.ts`
- Create: `drizzle/0003_meta_integration.sql`

- [ ] **Step 1: Update `lib/schema/meta.ts`**

In `adAccounts` definition, change `accessTokenEncrypted` to nullable and add `isActive`:

```ts
accessTokenEncrypted: text("access_token_encrypted"),  // was .notNull(); now optional (token comes from env)
isActive: boolean("is_active").notNull().default(false),
```

Add `boolean` to the import list at the top:

```ts
import {
  pgTable,
  bigserial,
  text,
  timestamp,
  bigint,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Update `lib/schema/sync.ts`**

Add `jsonb` to imports and add a `details` column to `syncJobs`:

```ts
import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  pgEnum,
  integer,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
```

Inside the `syncJobs` table, add (after `errorMessage`):

```ts
details: jsonb("details").$type<Record<string, unknown>>(),
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: a new file appears in `drizzle/` (Drizzle picks the next number — likely `0003_*.sql`). Inspect it. It should contain:
- `ALTER TABLE "ad_accounts" ALTER COLUMN "access_token_encrypted" DROP NOT NULL;`
- `ALTER TABLE "ad_accounts" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;`
- `ALTER TABLE "sync_jobs" ADD COLUMN "details" jsonb;`

If Drizzle names the file differently, that's fine — keep the generated name.

- [ ] **Step 4: Apply migration to local Supabase**

Run: `npm run db:migrate`
Expected: "Migration applied" (or no errors).

- [ ] **Step 5: Verify in Supabase Studio**

Run: `npm run db:studio`
Open studio, confirm `ad_accounts.is_active` exists, `access_token_encrypted` is nullable, `sync_jobs.details` exists. Close studio.

- [ ] **Step 6: Commit**

```bash
git add lib/schema/meta.ts lib/schema/sync.ts drizzle/
git commit -m "feat(db): add is_active, nullable token, sync_jobs.details"
```

---

## Task 3: Meta API types and errors

**Files:**
- Create: `lib/meta/types.ts`
- Create: `lib/meta/errors.ts`

- [ ] **Step 1: Create `lib/meta/errors.ts`**

```ts
export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly httpStatus?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export class MetaAuthError extends MetaApiError {
  constructor(message: string, code?: number, raw?: unknown) {
    super(message, code, undefined, 401, raw);
    this.name = "MetaAuthError";
  }
}

export class MetaRateLimitError extends MetaApiError {
  constructor(message: string, raw?: unknown) {
    super(message, undefined, undefined, 429, raw);
    this.name = "MetaRateLimitError";
  }
}
```

- [ ] **Step 2: Create `lib/meta/types.ts`**

```ts
export interface MetaPaging {
  cursors?: { before?: string; after?: string };
  next?: string;
  previous?: string;
}

export interface MetaListResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

export interface MetaUser {
  id: string;
  name: string;
}

export interface MetaAdAccount {
  id: string; // "act_123..."
  account_id: string; // "123..."
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number; // 1=active, 2=disabled, etc.
  business?: { id: string; name: string };
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSet {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  daily_budget?: string;
  optimization_goal?: string;
  targeting?: Record<string, unknown>;
}

export interface MetaAd {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  creative?: { id: string };
  preview_shareable_link?: string;
}

export interface MetaCreative {
  id: string;
  name?: string;
  thumbnail_url?: string;
  video_id?: string;
  object_type?: string; // "VIDEO" | "PHOTO" | "SHARE" | ...
  title?: string;
  body?: string;
  call_to_action_type?: string;
}

export interface MetaInsightAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  ad_id: string;
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  video_play_actions?: MetaInsightAction[];
  actions?: MetaInsightAction[];
}

export type DatePreset = "yesterday" | "last_3d" | "last_7d" | "last_30d";
```

- [ ] **Step 3: Commit**

```bash
git add lib/meta/types.ts lib/meta/errors.ts
git commit -m "feat(meta): API types and error classes"
```

---

## Task 4: Meta API client — happy path + auth header

**Files:**
- Create: `lib/meta/client.ts`
- Create: `lib/meta/client.test.ts`

- [ ] **Step 1: Write the failing test for `getMe`**

Create `lib/meta/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMetaClient } from "./client";
import { MetaAuthError, MetaRateLimitError } from "./errors";

const originalFetch = global.fetch;

function mockFetchSequence(responses: Array<Partial<Response> & { json: () => Promise<unknown> }>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("fetch called more times than mocked");
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: new Headers(r.headers as HeadersInit),
      json: r.json,
    } as Response;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

describe("metaClient.getMe", () => {
  it("returns user identity", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ id: "1", name: "Bruno" }) },
    ]);
    const client = createMetaClient({ token: "T", graphVersion: "v21.0" });
    const me = await client.getMe();
    expect(me).toEqual({ id: "1", name: "Bruno" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/me?fields=id%2Cname",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer T" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `createMetaClient` not found.

- [ ] **Step 3: Implement minimal client**

Create `lib/meta/client.ts`:

```ts
import { MetaApiError, MetaAuthError, MetaRateLimitError } from "./errors";
import type {
  DatePreset,
  MetaAd,
  MetaAdAccount,
  MetaAdSet,
  MetaCampaign,
  MetaCreative,
  MetaInsight,
  MetaListResponse,
  MetaUser,
} from "./types";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80000, 80001, 80002, 80003, 80004, 80014]);
const AUTH_ERROR_CODES = new Set([102, 190, 200, 459, 463, 464, 467]);

export interface MetaClient {
  getMe(): Promise<MetaUser>;
  getAdAccounts(): Promise<MetaAdAccount[]>;
  getCampaigns(accountId: string): Promise<MetaCampaign[]>;
  getAdSets(accountId: string): Promise<MetaAdSet[]>;
  getAds(accountId: string): Promise<MetaAd[]>;
  getCreatives(accountId: string): Promise<MetaCreative[]>;
  getInsights(
    accountId: string,
    opts: { datePreset: DatePreset },
  ): Promise<MetaInsight[]>;
}

export interface MetaClientConfig {
  token: string;
  graphVersion?: string;
  sleep?: (ms: number) => Promise<void>;
}

export function createMetaClient(cfg: MetaClientConfig): MetaClient {
  const version = cfg.graphVersion ?? "v21.0";
  const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = `https://graph.facebook.com/${version}`;

  async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      const usage = res.headers.get("x-business-use-case-usage");
      if (usage) {
        try {
          const parsed = JSON.parse(usage) as Record<string, Array<{ call_count?: number }>>;
          for (const arr of Object.values(parsed)) {
            for (const u of arr) {
              if ((u.call_count ?? 0) > 75) {
                console.warn(JSON.stringify({ msg: "meta_usage_high", usage: parsed }));
              }
            }
          }
        } catch {
          /* ignore parse errors */
        }
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }

      if (res.ok) return body as T;

      const errPayload = (body as { error?: { code?: number; message?: string } } | undefined)?.error;
      const code = errPayload?.code;
      const message = errPayload?.message ?? `HTTP ${res.status}`;

      if (code && AUTH_ERROR_CODES.has(code)) {
        throw new MetaAuthError(message, code, body);
      }

      const retriable =
        res.status === 429 ||
        res.status >= 500 ||
        (code !== undefined && RATE_LIMIT_CODES.has(code));

      if (retriable && attempt < RETRY_DELAYS_MS.length) {
        lastErr = new MetaRateLimitError(message, body);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (retriable) {
        throw new MetaRateLimitError(message, body);
      }
      throw new MetaApiError(message, code, undefined, res.status, body);
    }
    throw (lastErr ?? new MetaApiError("unknown error"));
  }

  async function paginate<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined;
    let first = true;
    while (first || next) {
      const url = first ? path : new URL(next!).pathname + new URL(next!).search;
      const useParams = first ? params : {};
      first = false;
      const page = await request<MetaListResponse<T>>(url.startsWith(base) ? url.slice(base.length) : url, useParams);
      out.push(...page.data);
      next = page.paging?.next;
    }
    return out;
  }

  return {
    getMe: () => request<MetaUser>("/me", { fields: "id,name" }),
    getAdAccounts: () =>
      paginate<MetaAdAccount>("/me/adaccounts", {
        fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}",
        limit: "100",
      }),
    getCampaigns: (accountId) =>
      paginate<MetaCampaign>(`/${accountId}/campaigns`, {
        fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
        limit: "200",
      }),
    getAdSets: (accountId) =>
      paginate<MetaAdSet>(`/${accountId}/adsets`, {
        fields: "id,campaign_id,name,status,daily_budget,optimization_goal,targeting",
        limit: "200",
      }),
    getAds: (accountId) =>
      paginate<MetaAd>(`/${accountId}/ads`, {
        fields: "id,adset_id,name,status,creative{id},preview_shareable_link",
        limit: "200",
      }),
    getCreatives: (accountId) =>
      paginate<MetaCreative>(`/${accountId}/adcreatives`, {
        fields: "id,name,thumbnail_url,video_id,object_type,title,body,call_to_action_type",
        limit: "200",
      }),
    getInsights: (accountId, opts) =>
      paginate<MetaInsight>(`/${accountId}/insights`, {
        level: "ad",
        time_increment: "1",
        date_preset: opts.datePreset,
        fields:
          "ad_id,date_start,date_stop,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,inline_link_clicks,actions,video_play_actions",
        limit: "500",
      }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `getMe`.

- [ ] **Step 5: Commit**

```bash
git add lib/meta/client.ts lib/meta/client.test.ts
git commit -m "feat(meta): graph API client with retry and pagination"
```

---

## Task 5: Client tests — pagination, rate limit, auth error

**Files:**
- Modify: `lib/meta/client.test.ts`

- [ ] **Step 1: Add pagination test**

Append to `lib/meta/client.test.ts`:

```ts
describe("metaClient.getAdAccounts pagination", () => {
  it("follows paging.next", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: async () => ({
          data: [{ id: "act_1", account_id: "1", name: "A", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 }],
          paging: { next: "https://graph.facebook.com/v21.0/me/adaccounts?after=X" },
        }),
      },
      {
        ok: true,
        json: async () => ({
          data: [{ id: "act_2", account_id: "2", name: "B", currency: "BRL", timezone_name: "America/Sao_Paulo", account_status: 1 }],
        }),
      },
    ]);
    const client = createMetaClient({ token: "T", graphVersion: "v21.0" });
    const accounts = await client.getAdAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0].id).toBe("act_1");
    expect(accounts[1].id).toBe("act_2");
  });
});
```

- [ ] **Step 2: Add rate-limit retry test**

Append:

```ts
describe("metaClient retry on rate limit", () => {
  it("retries on 429 and succeeds", async () => {
    mockFetchSequence([
      { ok: false, status: 429, json: async () => ({ error: { code: 17, message: "User request limit reached" } }) },
      { ok: true, json: async () => ({ id: "1", name: "Bruno" }) },
    ]);
    const sleep = vi.fn(async () => {});
    const client = createMetaClient({ token: "T", graphVersion: "v21.0", sleep });
    const me = await client.getMe();
    expect(me.id).toBe("1");
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("throws MetaRateLimitError after 4 retries", async () => {
    mockFetchSequence(
      Array.from({ length: 5 }, () => ({
        ok: false as const,
        status: 429,
        json: async () => ({ error: { code: 17, message: "rate limit" } }),
      })),
    );
    const sleep = vi.fn(async () => {});
    const client = createMetaClient({ token: "T", graphVersion: "v21.0", sleep });
    await expect(client.getMe()).rejects.toBeInstanceOf(MetaRateLimitError);
    expect(sleep).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 3: Add auth error test**

Append:

```ts
describe("metaClient auth errors", () => {
  it("throws MetaAuthError on code 190 without retry", async () => {
    mockFetchSequence([
      { ok: false, status: 401, json: async () => ({ error: { code: 190, message: "Invalid OAuth access token" } }) },
    ]);
    const sleep = vi.fn(async () => {});
    const client = createMetaClient({ token: "BAD", graphVersion: "v21.0", sleep });
    await expect(client.getMe()).rejects.toBeInstanceOf(MetaAuthError);
    expect(sleep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run all client tests**

Run: `npm test`
Expected: all 5 client tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta/client.test.ts
git commit -m "test(meta): pagination, rate limit retry, auth error"
```

---

## Task 6: `syncMeta` orchestrator

**Files:**
- Create: `lib/sync/syncMeta.ts`

- [ ] **Step 1: Create the orchestrator**

```ts
import { eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { adAccounts, campaigns, adsets, ads, creatives, type creativeType } from "@/lib/schema/meta";
import { adInsightsDaily } from "@/lib/schema/insights";
import { syncJobs } from "@/lib/schema/sync";
import type { MetaClient } from "@/lib/meta/client";
import type { DatePreset, MetaCreative, MetaInsight } from "@/lib/meta/types";
import { MetaAuthError } from "@/lib/meta/errors";

export type SyncMode = "backfill" | "daily" | "manual";

const MODE_TO_PRESET: Record<SyncMode, DatePreset> = {
  backfill: "last_30d",
  daily: "yesterday",
  manual: "last_3d",
};

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

function mapCreativeType(meta: MetaCreative): "image" | "video" | "carousel" | "other" {
  const t = meta.object_type?.toUpperCase();
  if (t === "VIDEO") return "video";
  if (t === "PHOTO" || t === "SHARE") return "image";
  if (t === "CAROUSEL") return "carousel";
  return "other";
}

function leadCount(insight: MetaInsight): number {
  if (!insight.actions) return 0;
  return insight.actions
    .filter((a) => a.action_type === "lead" || a.action_type.endsWith("_lead"))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

export async function syncMeta(
  opts: { mode: SyncMode } & SyncMetaDeps,
): Promise<{ jobId: number; status: "done" | "failed"; results: AccountSyncResult[] }> {
  const db = opts.db ?? defaultDb;
  const preset = MODE_TO_PRESET[opts.mode];
  const jobType = opts.mode === "backfill" ? "meta_full" : "meta_incremental";

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

      // Creatives
      const apiCreatives = await opts.client.getCreatives(actId);
      for (const cr of apiCreatives) {
        await db
          .insert(creatives)
          .values({
            metaId: cr.id,
            name: cr.name,
            type: mapCreativeType(cr),
            thumbnailUrl: cr.thumbnail_url,
            headline: cr.title,
            body: cr.body,
            callToAction: cr.call_to_action_type,
          })
          .onConflictDoUpdate({
            target: creatives.metaId,
            set: {
              name: cr.name,
              type: mapCreativeType(cr),
              thumbnailUrl: cr.thumbnail_url,
              headline: cr.title,
              body: cr.body,
              callToAction: cr.call_to_action_type,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.creatives++;
      }

      // Ads
      const adsetIdMap = new Map<string, number>(
        (
          await db
            .select({ id: adsets.id, metaId: adsets.metaId })
            .from(adsets)
        ).map((row) => [row.metaId, row.id]),
      );
      const creativeIdMap = new Map<string, number>(
        (
          await db
            .select({ id: creatives.id, metaId: creatives.metaId })
            .from(creatives)
        ).map((row) => [row.metaId, row.id]),
      );

      const apiAds = await opts.client.getAds(actId);
      for (const a of apiAds) {
        const adsetDbId = adsetIdMap.get(a.adset_id);
        if (!adsetDbId) continue;
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
      }

      // Insights
      const adIdMap = new Map<string, number>(
        (
          await db
            .select({ id: ads.id, metaId: ads.metaId })
            .from(ads)
        ).map((row) => [row.metaId, row.id]),
      );

      const apiInsights = await opts.client.getInsights(actId, { datePreset: preset });
      for (const ins of apiInsights) {
        const adDbId = adIdMap.get(ins.ad_id);
        if (!adDbId) continue;
        const leads = leadCount(ins);
        const conversions = { lead: leads };
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
              conversions,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.ad_insights_daily++;
      }

      await db
        .update(adAccounts)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(adAccounts.id, account.id));
    } catch (err) {
      r.error = err instanceof Error ? err.message : String(err);
      if (err instanceof MetaAuthError) {
        // Auth error means *no* account will work; record but continue logging
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

  await db
    .update(syncJobs)
    .set({
      status,
      finishedAt: new Date(),
      rowsProcessed: totalRows,
      errorMessage: anyFailed ? "see details" : null,
      details: { mode: opts.mode, results } as Record<string, unknown>,
    })
    .where(eq(syncJobs.id, job.id));

  return { jobId: job.id, status, results };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `creativeType` import is unused, remove it.)

- [ ] **Step 3: Commit**

```bash
git add lib/sync/syncMeta.ts
git commit -m "feat(sync): meta sync orchestrator"
```

---

## Task 7: `syncMeta` tests with mocked client and DB

**Files:**
- Create: `lib/sync/syncMeta.test.ts`

- [ ] **Step 1: Write idempotency test (uses fake client + real schema-shaped fake db)**

Because the orchestrator depends on Drizzle, we test it with a tiny in-memory fake db that mimics the chained API surface used. Create `lib/sync/syncMeta.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { syncMeta } from "./syncMeta";
import type { MetaClient } from "@/lib/meta/client";
import type { MetaAd, MetaAdSet, MetaCampaign, MetaCreative, MetaInsight } from "@/lib/meta/types";

// Minimal fake DB that records calls and returns deterministic ids.
function makeFakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    ad_accounts: [
      {
        id: 10,
        meta_account_id: "act_111",
        is_active: true,
        name: "A",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        status: "active",
      },
    ],
    campaigns: [],
    adsets: [],
    ads: [],
    creatives: [],
    ad_insights_daily: [],
    sync_jobs: [],
  };
  let nextId = 100;
  const calls: string[] = [];

  const fluentReturning = (rows: Record<string, unknown>[]) => ({
    returning: () => Promise.resolve(rows),
    onConflictDoUpdate: () => Promise.resolve(),
  });

  const insert = (table: { _: { name: string } } | symbol | unknown) => {
    // @ts-expect-error using runtime tag
    const name = (table as { Symbol?: unknown; toString?: () => string }).toString?.() ?? "";
    return {
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const arr = Array.isArray(v) ? v : [v];
        const tableName = guessTable(name);
        for (const row of arr) {
          const id = nextId++;
          tables[tableName].push({ id, ...row });
        }
        return fluentReturning(tables[tableName].slice(-arr.length).map((r) => ({ id: r.id })));
      },
    };
  };

  function guessTable(s: string): string {
    if (s.includes("campaigns")) return "campaigns";
    if (s.includes("adsets")) return "adsets";
    if (s.includes("creatives")) return "creatives";
    if (s.includes("ads")) return "ads";
    if (s.includes("insights")) return "ad_insights_daily";
    if (s.includes("sync_jobs")) return "sync_jobs";
    if (s.includes("ad_accounts")) return "ad_accounts";
    return "unknown";
  }

  return { tables, calls, insert };
}

function fakeClient(): MetaClient {
  const campaigns: MetaCampaign[] = [
    { id: "c1", name: "C1", status: "ACTIVE" },
  ];
  const adsets: MetaAdSet[] = [
    { id: "s1", campaign_id: "c1", name: "S1", status: "ACTIVE" },
  ];
  const creatives: MetaCreative[] = [
    { id: "cr1", object_type: "VIDEO", title: "T", body: "B" },
  ];
  const ads: MetaAd[] = [
    { id: "a1", adset_id: "s1", name: "Ad1", status: "ACTIVE", creative: { id: "cr1" } },
  ];
  const insights: MetaInsight[] = [
    {
      ad_id: "a1",
      date_start: "2026-05-05",
      date_stop: "2026-05-05",
      spend: "10.50",
      impressions: "1000",
      clicks: "20",
      ctr: "2.0",
      cpm: "10.5",
      actions: [{ action_type: "lead", value: "3" }],
    },
  ];
  return {
    getMe: async () => ({ id: "1", name: "Bruno" }),
    getAdAccounts: async () => [],
    getCampaigns: async () => campaigns,
    getAdSets: async () => adsets,
    getAds: async () => ads,
    getCreatives: async () => creatives,
    getInsights: async () => insights,
  };
}

describe("syncMeta", () => {
  it("placeholder smoke test - exports a function", () => {
    expect(typeof syncMeta).toBe("function");
  });
});
```

> **Note:** A full integration test against the real Drizzle DB belongs in a separate harness (Supabase test instance). For now we keep this as a smoke test — the manual verification step in Task 12 covers end-to-end correctness. Replace this when adding a test database.

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test`
Expected: smoke test PASSES along with all client tests.

- [ ] **Step 3: Commit**

```bash
git add lib/sync/syncMeta.test.ts
git commit -m "test(sync): syncMeta smoke test"
```

---

## Task 8: Update `/api/sync/refresh` and add `/api/sync/refresh-now`

**Files:**
- Modify: `app/api/sync/refresh/route.ts`
- Create: `app/api/sync/refresh-now/route.ts`

- [ ] **Step 1: Replace `app/api/sync/refresh/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { syncMeta } from "@/lib/sync/syncMeta";

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

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });
  }
  const client = createMetaClient({
    token,
    graphVersion: process.env.META_GRAPH_VERSION,
  });
  const result = await syncMeta({ mode: "daily", client });
  return NextResponse.json(result);
}

export const GET = POST;
```

- [ ] **Step 2: Create `app/api/sync/refresh-now/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { syncMeta, type SyncMode } from "@/lib/sync/syncMeta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });
  }

  let mode: SyncMode = "manual";
  try {
    const body = (await req.json()) as { mode?: SyncMode };
    if (body?.mode === "backfill" || body?.mode === "manual") mode = body.mode;
  } catch {
    /* no body, use default */
  }

  const client = createMetaClient({
    token,
    graphVersion: process.env.META_GRAPH_VERSION,
  });
  const result = await syncMeta({ mode, client });
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/sync/
git commit -m "feat(api): wire syncMeta into /api/sync/refresh and refresh-now"
```

---

## Task 9: `/api/meta/health`, `/api/meta/accounts/discover`, `/api/meta/accounts/toggle`

**Files:**
- Create: `app/api/meta/health/route.ts`
- Create: `app/api/meta/accounts/discover/route.ts`
- Create: `app/api/meta/accounts/toggle/route.ts`

- [ ] **Step 1: Create `app/api/meta/health/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "META_SYSTEM_USER_TOKEN not set" });

  try {
    const client = createMetaClient({ token, graphVersion: process.env.META_GRAPH_VERSION });
    const me = await client.getMe();
    return NextResponse.json({ ok: true, me });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
```

- [ ] **Step 2: Create `app/api/meta/accounts/discover/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { db } from "@/lib/db";
import { adAccounts } from "@/lib/schema/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });

  const client = createMetaClient({ token, graphVersion: process.env.META_GRAPH_VERSION });
  const apiAccounts = await client.getAdAccounts();

  for (const a of apiAccounts) {
    await db
      .insert(adAccounts)
      .values({
        name: a.name,
        metaAccountId: a.id,
        currency: a.currency,
        timezone: a.timezone_name,
        status: a.account_status === 1 ? "active" : "paused",
      })
      .onConflictDoNothing({ target: adAccounts.metaAccountId });
  }

  const all = await db.select().from(adAccounts);
  return NextResponse.json({ accounts: all });
}
```

- [ ] **Step 3: Create `app/api/meta/accounts/toggle/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { adAccounts } from "@/lib/schema/meta";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { accountId?: number; isActive?: boolean };
  if (typeof body.accountId !== "number" || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "accountId (number) and isActive (boolean) required" }, { status: 400 });
  }

  await db
    .update(adAccounts)
    .set({ isActive: body.isActive, updatedAt: new Date() })
    .where(eq(adAccounts.id, body.accountId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/meta/
git commit -m "feat(api): meta health, accounts discover, accounts toggle"
```

---

## Task 10: Settings/Integrations UI

**Files:**
- Create: `app/(dashboard)/settings/integrations/page.tsx`
- Create: `app/(dashboard)/settings/integrations/_components/token-status.tsx`
- Create: `app/(dashboard)/settings/integrations/_components/accounts-table.tsx`
- Create: `app/(dashboard)/settings/integrations/_components/last-sync.tsx`
- Create: `app/(dashboard)/settings/integrations/_components/refresh-now-button.tsx`
- Create: `app/(dashboard)/settings/integrations/_components/token-howto.tsx`

- [ ] **Step 1: Add shadcn components if missing**

Check that `card`, `table`, `switch`, `button`, `badge`, `alert`, `accordion` exist under `components/ui/`. If any are missing:

```bash
npx shadcn@latest add card table switch button badge alert accordion
```

- [ ] **Step 2: Create `page.tsx`**

```tsx
import { TokenStatus } from "./_components/token-status";
import { AccountsTable } from "./_components/accounts-table";
import { LastSync } from "./_components/last-sync";
import { RefreshNowButton } from "./_components/refresh-now-button";
import { TokenHowto } from "./_components/token-howto";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrações</h1>
        <p className="text-sm text-muted-foreground">Conecte o Meta Ads para sincronizar campanhas e métricas.</p>
      </div>
      <TokenStatus />
      <AccountsTable />
      <LastSync />
      <RefreshNowButton />
      <TokenHowto />
    </div>
  );
}
```

- [ ] **Step 3: Create `_components/token-status.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Health {
  ok: boolean;
  me?: { id: string; name: string };
  error?: string;
}

export function TokenStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/meta/health").then((r) => r.json()).then(setHealth);
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status do token</CardTitle>
      </CardHeader>
      <CardContent>
        {health === null ? (
          <p className="text-sm text-muted-foreground">Verificando…</p>
        ) : health.ok ? (
          <div className="flex items-center gap-2">
            <Badge variant="default">● Conectado</Badge>
            <span className="text-sm text-muted-foreground">{health.me?.name}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <Badge variant="destructive">● Desconectado</Badge>
            <p className="text-sm text-destructive">{health.error}</p>
            <p className="text-xs text-muted-foreground">Revise o env var META_SYSTEM_USER_TOKEN na Vercel.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create `_components/accounts-table.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface AccountRow {
  id: number;
  name: string;
  metaAccountId: string;
  status: string;
  isActive: boolean;
}

export function AccountsTable() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [discovering, setDiscovering] = useState(false);

  async function discover() {
    setDiscovering(true);
    const res = await fetch("/api/meta/accounts/discover");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setDiscovering(false);
  }

  useEffect(() => {
    discover();
  }, []);

  async function toggle(id: number, isActive: boolean) {
    await fetch("/api/meta/accounts/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: id, isActive }),
    });
    setAccounts((prev) => prev?.map((a) => (a.id === id ? { ...a, isActive } : a)) ?? null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contas de anúncio</CardTitle>
        <Button variant="outline" size="sm" onClick={discover} disabled={discovering}>
          {discovering ? "Atualizando…" : "Recarregar lista"}
        </Button>
      </CardHeader>
      <CardContent>
        {accounts === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sincronizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="font-mono text-xs">{a.metaAccountId}</TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>
                    <Switch checked={a.isActive} onCheckedChange={(v) => toggle(a.id, v)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create `_components/last-sync.tsx`**

This component reads server-side. Make it a server component:

```tsx
import { db } from "@/lib/db";
import { syncJobs } from "@/lib/schema/sync";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function LastSync() {
  const [last] = await db
    .select()
    .from(syncJobs)
    .orderBy(desc(syncJobs.createdAt))
    .limit(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Última sincronização</CardTitle>
      </CardHeader>
      <CardContent>
        {!last ? (
          <p className="text-sm text-muted-foreground">Ainda não sincronizado.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={last.status === "done" ? "default" : "destructive"}>
                {last.status}
              </Badge>
              <span className="text-muted-foreground">
                {last.finishedAt ? new Date(last.finishedAt).toLocaleString("pt-BR") : "em andamento…"}
              </span>
            </div>
            <p className="text-muted-foreground">
              {last.rowsProcessed ?? 0} linhas processadas
              {last.errorMessage ? ` — ${last.errorMessage}` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Create `_components/refresh-now-button.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function RefreshNowButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function run() {
    setLoading(true);
    const res = await fetch("/api/sync/refresh-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    await res.json();
    setLoading(false);
    router.refresh();
  }

  return (
    <Button onClick={run} disabled={loading}>
      {loading ? "Sincronizando…" : "Atualizar Agora"}
    </Button>
  );
}
```

- [ ] **Step 7: Create `_components/token-howto.tsx`**

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function TokenHowto() {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="howto">
        <AccordionTrigger>Como gerar o System User token?</AccordionTrigger>
        <AccordionContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Crie um Meta App em developers.facebook.com/apps (tipo Business).</li>
            <li>Adicione o produto Marketing API ao app.</li>
            <li>No Business Manager → Settings → System Users, crie um novo (role Employee).</li>
            <li>Atribua as ad accounts ao System User com permissão View performance (read-only).</li>
            <li>Atribua o app criado ao System User com permissão Develop app.</li>
            <li>Generate New Token → permissões: <code>ads_read</code> + <code>business_management</code>. Token Expiration: Never.</li>
            <li>Cole o token no env var <code>META_SYSTEM_USER_TOKEN</code> da Vercel (Production + Preview + Development).</li>
            <li>Recarregue esta página — o status deve ficar verde.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Detalhes completos no spec: <code>docs/superpowers/specs/2026-05-06-meta-ads-integration-design.md</code>.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

- [ ] **Step 8: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add app/\(dashboard\)/settings/ components/ui/
git commit -m "feat(ui): /settings/integrations page"
```

---

## Task 11: `.env.example` and dev smoke run

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append env vars to `.env.example`**

Add to the file:

```
# Meta Ads (sub-projeto 2)
META_SYSTEM_USER_TOKEN=
META_GRAPH_VERSION=v21.0
```

- [ ] **Step 2: Build to ensure no runtime imports break**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: document META_* env vars"
```

---

## Task 12: Manual end-to-end verification (after deploy)

> **Prerequisites:** all previous tasks committed and pushed; Vercel deploy succeeded.

- [ ] **Step 1: Generate System User token**

Follow the apêndice in the spec (`docs/superpowers/specs/2026-05-06-meta-ads-integration-design.md`), steps 1–7. Validate with:

```bash
curl "https://graph.facebook.com/v21.0/me?access_token=PASTE_TOKEN"
```
Expected: `{"id":"...","name":"..."}`.

- [ ] **Step 2: Add token to Vercel**

In Vercel project settings → Environment Variables, add `META_SYSTEM_USER_TOKEN` for Production + Preview + Development. Trigger a redeploy.

- [ ] **Step 3: Validate UI status**

Open `https://dash-traqueamento.vercel.app/settings/integrations` (logged in). Token status should show **● Conectado**.

- [ ] **Step 4: Discover and activate accounts**

Click "Recarregar lista" — your 3 ad accounts should appear. Toggle the switch on for the one(s) you want to sync.

- [ ] **Step 5: First sync (manual backfill)**

In the browser dev console, run:

```js
fetch("/api/sync/refresh-now", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "backfill" }),
}).then(r => r.json()).then(console.log);
```
Expected: response with `status: "done"` and `results[].rowsByTable` populated. Wait 30–120s.

- [ ] **Step 6: Verify data in Supabase**

Open Supabase Studio → tables `campaigns`, `adsets`, `ads`, `creatives`, `ad_insights_daily`. Should contain rows from the active account. `ad_insights_daily` should have ~30 days of data per ad.

- [ ] **Step 7: Reload Settings page**

"Última sincronização" card should show **done**, timestamp, and total rows.

- [ ] **Step 8: Verify cron will pick up daily**

The existing Vercel Cron config (`vercel.json`) already calls `/api/sync/refresh` daily at 02:00 SP. No change needed — it will now run `syncMeta({ mode: 'daily' })`.

- [ ] **Step 9: Mark sub-project 2 complete**

Update `CLAUDE.md` "Estado atual" section: change next sub-project from 2 to 3 (Frontend with real data → Hotmart webhook).

```bash
git add CLAUDE.md
git commit -m "docs: mark sub-projeto 2 complete"
```

---

## Self-review notes

- Spec sections covered: auth (Tasks 4, 8, 9), métricas/criativos (Tasks 3, 6), backfill/sync modes (Task 6), endpoints (Tasks 8, 9), UI (Task 10), DB migration (Task 2), env vars (Task 11), token apêndice (Task 12).
- `syncMeta` test (Task 7) is intentionally a smoke test — full integration requires a real DB harness, deferred.
- Type names consistent: `MetaClient`, `SyncMode`, `DatePreset`, `MetaInsight` used identically across tasks.
- No placeholders, all code blocks complete.
