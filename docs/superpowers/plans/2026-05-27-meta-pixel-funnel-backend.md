# Meta Pixel Funnel Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar o sync Meta para capturar `landing_page_view`, `initiate_checkout` (Pixel events) e a URL de destino dos ads. Declarar materialized views no Drizzle. Sem mudanças de UI.

**Architecture:** Mínima invasão. Schema: +1 coluna nullable em `ads`, JSON `conversions` ganha 2 chaves opcionais. Sync: helpers novos para extração da URL e ampliação do extractor de actions. MVs migram para serem declaradas em Drizzle (resolve dívida técnica) com `DROP + CREATE` em migration manual. Backfill via `mode=backfill` existente.

**Tech Stack:** Next.js 15 + TypeScript, Drizzle ORM, Postgres (Supabase), Vitest, Meta Graph API v25.

---

## File Structure

**Criados:**
- `lib/schema/views.ts` — declara `adsetInsightsDaily` e `campaignInsightsDaily` como `pgMaterializedView` (com `.existing()` para não recriar via push)
- `lib/meta/extractors.ts` — helper `extractLandingUrl(creative)` testa 3 paths
- `drizzle/manual/002_pixel_funnel_views.sql` — `DROP + CREATE` das MVs com novas colunas
- `lib/meta/extractors.test.ts` — testes do extractor de URL

**Modificados:**
- `lib/schema/meta.ts` — +`landingUrl` em `ads`
- `lib/schema/insights.ts` — tipar `conversions` como `AdConversions`
- `lib/schema/index.ts` — re-exportar `views.ts`
- `lib/meta/types.ts` — +tipos `MetaObjectStorySpec`, `MetaAssetFeedSpec`, expandir `MetaCreative`
- `lib/meta/client.ts` — pedir `object_story_spec,asset_feed_spec` no `getCreativesByIds`
- `lib/sync/syncMeta.ts` — (a) exportar `extractConversions` para teste, (b) ampliar matchers, (c) popular `landingUrl`, (d) `REFRESH MATERIALIZED VIEW CONCURRENTLY` ao final
- `lib/sync/syncMeta.test.ts` — casos de `extractConversions` com novos matchers

---

### Task 1: Tipar conversions no schema

**Files:**
- Modify: `lib/schema/insights.ts`

- [ ] **Step 1: Definir e usar `AdConversions`**

Substituir a linha `jsonb("conversions").$type<Record<string, number>>()...` por:

```typescript
export type AdConversions = {
  lead?: number;
  purchase?: number;
  revenue?: number;
  follow?: number;
  engagement?: number;
  landing_page_view?: number;
  initiate_checkout?: number;
};
```

E:

```typescript
conversions: jsonb("conversions").$type<AdConversions>().default({}),
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: pass (rows existentes continuam compatíveis — todas as chaves são opcionais).

- [ ] **Step 3: Commit**

```bash
git add lib/schema/insights.ts
git commit -m "refactor(schema): type ad_insights conversions as AdConversions"
```

---

### Task 2: Adicionar `landing_url` em ads

**Files:**
- Modify: `lib/schema/meta.ts`
- Create: `drizzle/0014_ads_landing_url.sql`

- [ ] **Step 1: Adicionar coluna no schema Drizzle**

Em `lib/schema/meta.ts`, dentro do `pgTable("ads", ...)`, depois de `previewUrl: text("preview_url"),` adicionar:

```typescript
landingUrl: text("landing_url"),
```

- [ ] **Step 2: Gerar migration**

Run: `npx drizzle-kit generate`
Expected: cria `drizzle/0014_<random_name>.sql` com `ALTER TABLE "ads" ADD COLUMN "landing_url" text;`

- [ ] **Step 3: Renomear migration para nome descritivo (opcional)**

Se nome gerado for genérico, renomear para `drizzle/0014_ads_landing_url.sql`. Atualizar `drizzle/meta/_journal.json` se rename.

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/schema/meta.ts drizzle/0014_*.sql drizzle/meta/_journal.json drizzle/meta/0014_snapshot.json
git commit -m "feat(schema): add landing_url to ads"
```

---

### Task 3: Tipos para `object_story_spec` e `asset_feed_spec`

**Files:**
- Modify: `lib/meta/types.ts`

- [ ] **Step 1: Adicionar tipos**

No final do arquivo (antes do `export type DatePreset`), adicionar:

```typescript
export interface MetaLinkData {
  link?: string;
  message?: string;
  name?: string;
  description?: string;
}

export interface MetaVideoCTAValue {
  link?: string;
  link_format?: string;
}

export interface MetaVideoCTA {
  type?: string;
  value?: MetaVideoCTAValue;
}

export interface MetaVideoData {
  call_to_action?: MetaVideoCTA;
  video_id?: string;
}

export interface MetaObjectStorySpec {
  page_id?: string;
  link_data?: MetaLinkData;
  video_data?: MetaVideoData;
}

export interface MetaAssetFeedLinkUrl {
  website_url?: string;
  display_url?: string;
}

export interface MetaAssetFeedSpec {
  link_urls?: MetaAssetFeedLinkUrl[];
}
```

E expandir `MetaCreative`, adicionando depois de `call_to_action_type?: string;`:

```typescript
  object_story_spec?: MetaObjectStorySpec;
  asset_feed_spec?: MetaAssetFeedSpec;
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add lib/meta/types.ts
git commit -m "feat(meta): add object_story_spec and asset_feed_spec types"
```

---

### Task 4: Helper `extractLandingUrl` (TDD)

**Files:**
- Create: `lib/meta/extractors.ts`
- Create: `lib/meta/extractors.test.ts`

- [ ] **Step 1: Escrever testes (fail)**

Conteúdo de `lib/meta/extractors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractLandingUrl } from "./extractors";
import type { MetaCreative } from "./types";

describe("extractLandingUrl", () => {
  it("retorna null para criativo sem specs", () => {
    expect(extractLandingUrl({ id: "1" })).toBeNull();
  });

  it("extrai de object_story_spec.link_data.link (imagem single)", () => {
    const creative: MetaCreative = {
      id: "1",
      object_story_spec: {
        link_data: { link: "https://guia-alzheimer-v1.lovable.app/" },
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://guia-alzheimer-v1.lovable.app/");
  });

  it("extrai de object_story_spec.video_data.call_to_action.value.link (vídeo)", () => {
    const creative: MetaCreative = {
      id: "2",
      object_story_spec: {
        video_data: {
          call_to_action: {
            type: "LEARN_MORE",
            value: { link: "https://guia-alzheimer-v2.lovable.app/" },
          },
        },
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://guia-alzheimer-v2.lovable.app/");
  });

  it("extrai de asset_feed_spec.link_urls[0].website_url (Advantage+)", () => {
    const creative: MetaCreative = {
      id: "3",
      asset_feed_spec: {
        link_urls: [
          { website_url: "https://guia-alzheimer-v3.lovable.app/" },
          { website_url: "https://outra.lovable.app/" },
        ],
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://guia-alzheimer-v3.lovable.app/");
  });

  it("prefere object_story_spec quando ambos estão presentes", () => {
    const creative: MetaCreative = {
      id: "4",
      object_story_spec: { link_data: { link: "https://primary.lovable.app/" } },
      asset_feed_spec: {
        link_urls: [{ website_url: "https://fallback.lovable.app/" }],
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://primary.lovable.app/");
  });

  it("ignora strings vazias e descarta para próximo path", () => {
    const creative: MetaCreative = {
      id: "5",
      object_story_spec: { link_data: { link: "" } },
      asset_feed_spec: {
        link_urls: [{ website_url: "https://fallback.lovable.app/" }],
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://fallback.lovable.app/");
  });
});
```

- [ ] **Step 2: Rodar teste — espera FAIL**

Run: `npx vitest run lib/meta/extractors.test.ts`
Expected: FAIL — `Cannot find module './extractors'`.

- [ ] **Step 3: Implementar `extractLandingUrl`**

Conteúdo de `lib/meta/extractors.ts`:

```typescript
import type { MetaCreative } from "./types";

/**
 * Meta retorna a URL de destino do anúncio em 3 lugares diferentes,
 * dependendo do formato do criativo:
 *  - imagem single → object_story_spec.link_data.link
 *  - vídeo → object_story_spec.video_data.call_to_action.value.link
 *  - Advantage+ / asset feed → asset_feed_spec.link_urls[0].website_url
 *
 * Retorna a primeira string não-vazia ou null. Se houver múltiplas URLs
 * (asset feed), guarda só a primeira — mesmo comportamento do Looker.
 */
export function extractLandingUrl(creative: MetaCreative): string | null {
  const linkData = creative.object_story_spec?.link_data?.link;
  if (typeof linkData === "string" && linkData.length > 0) return linkData;

  const videoCta = creative.object_story_spec?.video_data?.call_to_action?.value?.link;
  if (typeof videoCta === "string" && videoCta.length > 0) return videoCta;

  const firstFeedUrl = creative.asset_feed_spec?.link_urls?.[0]?.website_url;
  if (typeof firstFeedUrl === "string" && firstFeedUrl.length > 0) return firstFeedUrl;

  return null;
}
```

- [ ] **Step 4: Rodar teste — espera PASS**

Run: `npx vitest run lib/meta/extractors.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/meta/extractors.ts lib/meta/extractors.test.ts
git commit -m "feat(meta): extractLandingUrl helper with 3-path fallback"
```

---

### Task 5: Pedir specs no fetch de creatives

**Files:**
- Modify: `lib/meta/client.ts:202`

- [ ] **Step 1: Adicionar fields ao GET de creatives**

Em `lib/meta/client.ts:202`, substituir a string:

```typescript
"id,name,thumbnail_url,image_url,video_id,object_type,title,body,call_to_action_type",
```

por:

```typescript
"id,name,thumbnail_url,image_url,video_id,object_type,title,body,call_to_action_type,object_story_spec,asset_feed_spec",
```

- [ ] **Step 2: Verificar testes existentes do client**

Run: `npx vitest run lib/meta/client.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/meta/client.ts
git commit -m "feat(meta): fetch object_story_spec and asset_feed_spec in creatives"
```

---

### Task 6: Ampliar `extractConversions` (TDD)

**Files:**
- Modify: `lib/sync/syncMeta.ts`
- Modify: `lib/sync/syncMeta.test.ts`

- [ ] **Step 1: Tornar `extractConversions` exportada**

Em `lib/sync/syncMeta.ts:133`, mudar:

```typescript
function extractConversions(insight: MetaInsight): Record<string, number> {
```

para:

```typescript
export function extractConversions(insight: MetaInsight): import("../schema/insights").AdConversions {
```

- [ ] **Step 2: Escrever testes (fail)**

Substituir o conteúdo de `lib/sync/syncMeta.test.ts` por:

```typescript
import { describe, it, expect } from "vitest";
import { syncMeta, extractConversions } from "./syncMeta";
import type { MetaInsight } from "../meta/types";

describe("syncMeta", () => {
  it("exports a function", () => {
    expect(typeof syncMeta).toBe("function");
  });
});

describe("extractConversions", () => {
  function insight(actions: { action_type: string; value: string }[]): MetaInsight {
    return {
      ad_id: "1",
      date_start: "2026-05-26",
      date_stop: "2026-05-26",
      actions,
    };
  }

  it("extrai landing_page_view do action_type nativo", () => {
    const c = extractConversions(insight([
      { action_type: "landing_page_view", value: "144" },
    ]));
    expect(c.landing_page_view).toBe(144);
  });

  it("extrai landing_page_view do alias fb_pixel_view_content", () => {
    const c = extractConversions(insight([
      { action_type: "offsite_conversion.fb_pixel_view_content", value: "97" },
    ]));
    expect(c.landing_page_view).toBe(97);
  });

  it("extrai initiate_checkout escolhendo omni quando disponível (sem somar duplicadas)", () => {
    // Meta reporta o MESMO evento sob múltiplos action_type — pickByPriority evita dedup
    const c = extractConversions(insight([
      { action_type: "omni_initiated_checkout", value: "8" },
      { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "8" },
      { action_type: "initiate_checkout", value: "8" },
    ]));
    expect(c.initiate_checkout).toBe(8);
  });

  it("usa fallback de prioridade quando omni_initiated_checkout não está presente", () => {
    const c = extractConversions(insight([
      { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "4" },
    ]));
    expect(c.initiate_checkout).toBe(4);
  });

  it("retorna 0 para landing_page_view e initiate_checkout quando ausentes", () => {
    const c = extractConversions(insight([
      { action_type: "lead", value: "5" },
    ]));
    expect(c.landing_page_view).toBe(0);
    expect(c.initiate_checkout).toBe(0);
    expect(c.lead).toBe(5);
  });

  it("preserva chaves existentes (purchase, lead, revenue) ao adicionar novas", () => {
    const c = extractConversions({
      ad_id: "1",
      date_start: "2026-05-26",
      date_stop: "2026-05-26",
      actions: [
        { action_type: "lead", value: "10" },
        { action_type: "omni_purchase", value: "2" },
        { action_type: "landing_page_view", value: "144" },
        { action_type: "omni_initiated_checkout", value: "8" },
      ],
      action_values: [
        { action_type: "omni_purchase", value: "397.00" },
      ],
    });
    expect(c).toMatchObject({
      lead: 10,
      purchase: 2,
      revenue: 397,
      landing_page_view: 144,
      initiate_checkout: 8,
    });
  });
});
```

- [ ] **Step 3: Rodar teste — espera FAIL**

Run: `npx vitest run lib/sync/syncMeta.test.ts`
Expected: FAIL — `c.landing_page_view` e `c.initiate_checkout` são `undefined`.

- [ ] **Step 4: Ampliar `extractConversions`**

Em `lib/sync/syncMeta.ts:133-163`, no corpo da função, antes do `return`, adicionar:

```typescript
  const isLandingPageView = (t: string) =>
    t === "landing_page_view" ||
    t === "offsite_conversion.fb_pixel_view_content";

  const checkoutMatchers = [
    (t: string) => t === "omni_initiated_checkout",
    (t: string) => t === "offsite_conversion.fb_pixel_initiate_checkout",
    (t: string) => t === "initiate_checkout",
  ];
```

E no `return`, adicionar duas linhas:

```typescript
  return {
    lead: sumActions(insight.actions, isLead),
    purchase: pickByPriority(insight.actions, purchaseMatchers),
    revenue: pickByPriority(insight.action_values, purchaseMatchers),
    follow: sumActions(insight.actions, isFollow),
    engagement: sumActions(insight.actions, isEngagement),
    landing_page_view: sumActions(insight.actions, isLandingPageView),
    initiate_checkout: pickByPriority(insight.actions, checkoutMatchers),
  };
```

- [ ] **Step 5: Rodar teste — espera PASS**

Run: `npx vitest run lib/sync/syncMeta.test.ts`
Expected: PASS.

- [ ] **Step 6: Rodar suite inteira**

Run: `npm run test`
Expected: tudo passa.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/syncMeta.ts lib/sync/syncMeta.test.ts
git commit -m "feat(sync): capture landing_page_view and initiate_checkout from Pixel actions"
```

---

### Task 7: Popular `landing_url` no upsert de ads

**Files:**
- Modify: `lib/sync/syncMeta.ts`

- [ ] **Step 1: Importar `extractLandingUrl`**

Em `lib/sync/syncMeta.ts`, no topo do arquivo, adicionar:

```typescript
import { extractLandingUrl } from "../meta/extractors";
```

- [ ] **Step 2: Construir map de URL por meta_id de criativo**

Onde os criativos são iterados (próximo do bloco `apiCreatives` em `lib/sync/syncMeta.ts:295`), antes do `await inBatches(apiCreatives, ...)`, adicionar:

```typescript
      const creativeLandingUrls = new Map<string, string | null>();
      for (const cr of apiCreatives) {
        creativeLandingUrls.set(cr.id, extractLandingUrl(cr));
      }
```

- [ ] **Step 3: Passar `landingUrl` no upsert de ads**

No bloco `await inBatches(apiAds, ...)` (~`lib/sync/syncMeta.ts:334`), no `.values()` adicionar:

```typescript
            landingUrl: a.creative?.id
              ? creativeLandingUrls.get(a.creative.id) ?? null
              : null,
```

E no `.set()` do `onConflictDoUpdate`:

```typescript
              landingUrl: a.creative?.id
                ? creativeLandingUrls.get(a.creative.id) ?? null
                : null,
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Rodar testes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/syncMeta.ts
git commit -m "feat(sync): populate ads.landing_url from creative specs"
```

---

### Task 8: Declarar materialized views em Drizzle

**Files:**
- Create: `lib/schema/views.ts`
- Modify: `lib/schema/index.ts`

- [ ] **Step 1: Criar `lib/schema/views.ts`**

Conteúdo:

```typescript
import {
  pgMaterializedView,
  bigint,
  date,
  integer,
  numeric,
} from "drizzle-orm/pg-core";

/**
 * Declaração das materialized views existentes em prod.
 * `.existing()` informa ao Drizzle que a view já foi criada em migration
 * manual (drizzle/manual/) — `db:push` não tenta criar de novo.
 *
 * As colunas refletem o estado pós-migration 002_pixel_funnel_views.sql.
 */

export const adsetInsightsDaily = pgMaterializedView("adset_insights_daily", {
  adsetId: bigint("adset_id", { mode: "number" }).notNull(),
  date: date("date").notNull(),
  impressions: bigint("impressions", { mode: "number" }),
  clicks: bigint("clicks", { mode: "number" }),
  spend: numeric("spend", { precision: 14, scale: 2 }),
  cpm: numeric("cpm", { precision: 14, scale: 4 }),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  linkClicks: bigint("link_clicks", { mode: "number" }),
  videoViews: bigint("video_views", { mode: "number" }),
  landingPageView: bigint("landing_page_view", { mode: "number" }),
  initiateCheckout: bigint("initiate_checkout", { mode: "number" }),
  purchase: bigint("purchase", { mode: "number" }),
  revenue: numeric("revenue", { precision: 14, scale: 2 }),
}).existing();

export const campaignInsightsDaily = pgMaterializedView("campaign_insights_daily", {
  campaignId: bigint("campaign_id", { mode: "number" }).notNull(),
  date: date("date").notNull(),
  impressions: bigint("impressions", { mode: "number" }),
  clicks: bigint("clicks", { mode: "number" }),
  spend: numeric("spend", { precision: 14, scale: 2 }),
  cpm: numeric("cpm", { precision: 14, scale: 4 }),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  linkClicks: bigint("link_clicks", { mode: "number" }),
  landingPageView: bigint("landing_page_view", { mode: "number" }),
  initiateCheckout: bigint("initiate_checkout", { mode: "number" }),
  purchase: bigint("purchase", { mode: "number" }),
  revenue: numeric("revenue", { precision: 14, scale: 2 }),
}).existing();
```

- [ ] **Step 2: Re-exportar em `lib/schema/index.ts`**

Adicionar no final do arquivo:

```typescript
export * from "./views";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/schema/views.ts lib/schema/index.ts
git commit -m "feat(schema): declare existing materialized views in Drizzle"
```

---

### Task 9: Migration manual com novas colunas nas MVs

**Files:**
- Create: `drizzle/manual/002_pixel_funnel_views.sql`

- [ ] **Step 1: Criar migration**

Conteúdo de `drizzle/manual/002_pixel_funnel_views.sql`:

```sql
-- Recria adset_insights_daily e campaign_insights_daily com agregações
-- de Pixel events (landing_page_view, initiate_checkout) e purchase/revenue.
-- Definição base preservada do 001_insights_views.sql.

DROP MATERIALIZED VIEW IF EXISTS adset_insights_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS campaign_insights_daily CASCADE;

-- Adset
CREATE MATERIALIZED VIEW adset_insights_daily AS
SELECT
  a.adset_id,
  i.date,
  SUM(i.impressions) AS impressions,
  SUM(i.clicks) AS clicks,
  SUM(i.spend)::numeric(14,2) AS spend,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.spend) / SUM(i.impressions) * 1000)::numeric(14,4)
       ELSE NULL END AS cpm,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(8,4)
       ELSE NULL END AS ctr,
  SUM(i.link_clicks) AS link_clicks,
  SUM(i.video_views) AS video_views,
  SUM(COALESCE((i.conversions->>'landing_page_view')::int, 0)) AS landing_page_view,
  SUM(COALESCE((i.conversions->>'initiate_checkout')::int, 0)) AS initiate_checkout,
  SUM(COALESCE((i.conversions->>'purchase')::int, 0)) AS purchase,
  SUM(COALESCE((i.conversions->>'revenue')::numeric, 0))::numeric(14,2) AS revenue
FROM ad_insights_daily i
JOIN ads a ON a.id = i.ad_id
GROUP BY a.adset_id, i.date;

CREATE UNIQUE INDEX adset_insights_daily_uq
  ON adset_insights_daily(adset_id, date);

-- Campaign
CREATE MATERIALIZED VIEW campaign_insights_daily AS
SELECT
  s.campaign_id,
  i.date,
  SUM(i.impressions) AS impressions,
  SUM(i.clicks) AS clicks,
  SUM(i.spend)::numeric(14,2) AS spend,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.spend) / SUM(i.impressions) * 1000)::numeric(14,4)
       ELSE NULL END AS cpm,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(8,4)
       ELSE NULL END AS ctr,
  SUM(i.link_clicks) AS link_clicks,
  SUM(COALESCE((i.conversions->>'landing_page_view')::int, 0)) AS landing_page_view,
  SUM(COALESCE((i.conversions->>'initiate_checkout')::int, 0)) AS initiate_checkout,
  SUM(COALESCE((i.conversions->>'purchase')::int, 0)) AS purchase,
  SUM(COALESCE((i.conversions->>'revenue')::numeric, 0))::numeric(14,2) AS revenue
FROM ad_insights_daily i
JOIN ads a ON a.id = i.ad_id
JOIN adsets s ON s.id = a.adset_id
GROUP BY s.campaign_id, i.date;

CREATE UNIQUE INDEX campaign_insights_daily_uq
  ON campaign_insights_daily(campaign_id, date);
```

- [ ] **Step 2: Commit**

```bash
git add drizzle/manual/002_pixel_funnel_views.sql
git commit -m "feat(db): pixel funnel columns in materialized views"
```

---

### Task 10: Refresh das MVs no final do sync

**Files:**
- Modify: `lib/sync/syncMeta.ts`

- [ ] **Step 1: Adicionar import `sql`**

Em `lib/sync/syncMeta.ts`, garantir que `sql` está importado de `drizzle-orm`:

```typescript
import { eq, inArray, sql } from "drizzle-orm";
```

(adicionar `sql` à lista existente se ainda não estiver).

- [ ] **Step 2: Refresh ao final do sync**

Encontrar o final do bloco `for (const account of activeAccounts)` em `syncMeta`. Depois do loop (mas antes do `update` que marca o job como `done`), adicionar:

```typescript
  // Refresh materialized views (CONCURRENTLY exige unique index — ver
  // drizzle/manual/002_pixel_funnel_views.sql). Falha aqui não derruba
  // o sync — só loga.
  try {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY adset_insights_daily`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_insights_daily`);
  } catch (err) {
    console.warn(
      JSON.stringify({
        msg: "mv_refresh_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Rodar testes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/syncMeta.ts
git commit -m "feat(sync): refresh materialized views after sync"
```

---

### Task 11: Verificação local

**Files:** nenhum (só validações).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Testes**

Run: `npm run test`
Expected: PASS — incluindo os 6 novos de `extractLandingUrl` e os de `extractConversions`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

Se algum falhar, voltar e corrigir antes do deploy.

---

## Pós-execução (manual em prod, fora do plano automatizado)

Estes passos exigem acesso ao DB de prod e à Vercel e devem ser executados pelo Bruno (ou com supervisão dele):

1. **Aplicar migrations:**
   ```bash
   npx drizzle-kit migrate
   psql "$DATABASE_URL" -f drizzle/manual/002_pixel_funnel_views.sql
   ```

2. **Deploy do código** (push para `main` → Vercel auto-deploy).

3. **Rodar backfill uma vez:**
   ```bash
   curl -X POST "https://dash-traqueamento.vercel.app/api/sync/refresh-now?mode=backfill" \
     -H "x-sync-token: $SYNC_TOKEN"
   ```

4. **Validar:**
   ```sql
   -- novas chaves populadas
   SELECT
     COUNT(*) AS total,
     COUNT(*) FILTER (WHERE conversions ? 'landing_page_view') AS com_lpv,
     COUNT(*) FILTER (WHERE conversions ? 'initiate_checkout') AS com_chkt
   FROM ad_insights_daily
   WHERE date >= CURRENT_DATE - 30;

   -- landing_url em ads do Guia
   SELECT COUNT(*) AS total, COUNT(landing_url) AS com_url
   FROM ads a
   JOIN adsets s ON s.id = a.adset_id
   JOIN campaigns c ON c.id = s.campaign_id
   WHERE c.name ~ 'PERPETUO-GUIA|GUIA.*OBA' AND a.status = 'ACTIVE';

   -- comparação com Looker
   SELECT date,
     SUM(impressions),
     SUM((conversions->>'landing_page_view')::int) AS lpv,
     SUM((conversions->>'initiate_checkout')::int) AS chkt
   FROM ad_insights_daily i
   JOIN ads a ON a.id = i.ad_id
   JOIN adsets s ON s.id = a.adset_id
   JOIN campaigns c ON c.id = s.campaign_id
   WHERE date IN ('2026-05-26', '2026-05-24', '2026-05-22')
     AND c.name ~ 'PERPETUO-GUIA|GUIA.*OBA'
   GROUP BY date ORDER BY date DESC;
   ```

   Esperado: dia 2026-05-26 deve mostrar ~4.544 impr, ~144 LPV, ~8 checkout (do print do Looker, ±5%).
