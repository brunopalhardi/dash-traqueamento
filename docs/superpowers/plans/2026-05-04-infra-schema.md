# Sub-projeto 1: Infra + Schema — Implementation Plan

> **Para subagentes:** SUB-SKILL OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans pra implementar este plano task por task. Steps usam checkbox (`- [ ]`) pra tracking.

**Goal:** Entregar shell funcional do dashboard — login Supabase, schema completo aplicado, worker rodando job "ping" na VPS, deploy automático no Vercel.

**Architecture:** Next.js 15 App Router (Vercel) + Supabase Postgres/Auth + Worker Node.js na VPS BR (BullMQ + Redis Upstash). Single-tenant. Drizzle ORM. shadcn/ui + Tailwind. Recharts.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, shadcn/ui, Drizzle ORM, Supabase, BullMQ, node-cron, Upstash Redis, pm2, Vercel, Hostinger VPS BR.

**Spec:** Ver [docs/superpowers/specs/2026-05-04-infra-schema-design.md](../specs/2026-05-04-infra-schema-design.md)

---

## Pré-requisitos (Bruno faz manualmente antes de começar)

Cria contas e anota credenciais num arquivo local `~/.traqueamento-secrets.txt` (NÃO COMITAR):

- [ ] **GitHub** repo privado `traqueamento` criado, sem README ainda
- [ ] **Supabase** projeto novo `traqueamento-prod` (região São Paulo)
  - Anota: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (connection string com pooler, modo session)
- [ ] **Vercel** conta conectada ao GitHub (sem importar projeto ainda)
- [ ] **Upstash** conta criada, redis grátis `traqueamento-queue` (região mais próxima de SP)
  - Anota: `REDIS_URL` (formato `rediss://...`)
- [ ] **Hostinger VPS** KVM 1 (ou similar, ~R$20/mo) provisionada, Ubuntu 24.04 LTS, datacenter Brasil
  - Anota: IP público, senha root, ou melhor — sobe uma chave SSH desde já
- [ ] **Domínio** apontado pro Vercel (opcional pra esta fase, dá pra usar `*.vercel.app` no início)
- [ ] **Cloudflare/Resend** (futuro — pra alertas de falha; NÃO precisa agora)

Antes de começar a Task 1: confirma que tem todas as credenciais acima.

---

## Phase 1 — Bootstrap do projeto

### Task 1: Inicializar repo + Next.js + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `README.md`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Inicializar Next.js**

```bash
cd /Users/macintosh/Documents/Claude.Code/Dashboard/Traqueamento
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm --eslint
```

Quando perguntar `Would you like to use Turbopack`: **Yes**.

- [ ] **Step 2: Verificar estrutura**

```bash
ls
```

Esperado: `app/`, `public/`, `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`.

- [ ] **Step 3: Criar `.env.example`**

```bash
cat > .env.example <<'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Redis (Upstash)
REDIS_URL=

# Meta Ads (preencher no sub-projeto 2)
META_APP_ID=
META_APP_SECRET=

# Hotmart (preencher no sub-projeto 4)
HOTMART_WEBHOOK_SECRET=
EOF
```

Copia pra `.env.local` e preenche o que tiver agora.

```bash
cp .env.example .env.local
```

- [ ] **Step 4: Adicionar `.env.local` no `.gitignore`** (já vem por padrão, conferir)

```bash
grep -q "^.env.local$" .gitignore || echo ".env.local" >> .gitignore
grep -q "^.env\*.local$" .gitignore || echo ".env*.local" >> .gitignore
```

- [ ] **Step 5: Inicializar git e primeiro commit**

```bash
git init
git add .
git commit -m "chore: bootstrap Next.js 15 with TypeScript, Tailwind, App Router"
git branch -M main
git remote add origin git@github.com:<seu-user>/traqueamento.git
git push -u origin main
```

---

### Task 2: Instalar shadcn/ui + componentes base

**Files:**
- Modify: `tailwind.config.ts`, `app/globals.css`, `package.json`
- Create: `components/ui/*` (button, card, input, label, dropdown-menu, separator, sonner)

- [ ] **Step 1: Init shadcn**

```bash
npx shadcn@latest init
```

Respostas:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**

- [ ] **Step 2: Adicionar componentes que vamos usar**

```bash
npx shadcn@latest add button card input label dropdown-menu separator sonner avatar dialog tabs badge skeleton table
```

- [ ] **Step 3: Confirmar dark mode no `app/globals.css`**

Editar `app/globals.css` — confirmar que `:root.dark` está definido com paleta escura. Forçar dark mode default no `app/layout.tsx`:

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Traqueamento",
  description: "Dashboard de tráfego pago + vendas",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Abre `http://localhost:3000`. Deve carregar página default do Next.js em dark mode (fundo escuro). `Ctrl+C` pra parar.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: install shadcn/ui with dark mode default"
git push
```

---

## Phase 2 — Schema do banco

### Task 3: Configurar Drizzle ORM + conexão Supabase

**Files:**
- Create: `drizzle.config.ts`, `lib/db.ts`, `lib/schema/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar Drizzle e driver Postgres**

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit @types/pg
```

- [ ] **Step 2: Criar `drizzle.config.ts`**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 3: Criar `lib/db.ts`**

```ts
// lib/db.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error("DATABASE_URL não definida");
}

// pooler do Supabase já gerencia conexões; aqui usamos prepare:false pra compat com pgbouncer
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
export type DB = typeof db;
```

- [ ] **Step 4: Criar arquivo de schema vazio (será preenchido nas próximas tasks)**

```ts
// lib/schema/index.ts
export * from "./auth";
export * from "./meta";
export * from "./insights";
export * from "./leads";
export * from "./sync";
```

- [ ] **Step 5: Adicionar scripts no `package.json`**

Editar `package.json`, adicionar dentro de `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 6: Commit (sem migrations ainda — schema vem nas próximas tasks)**

```bash
git add .
git commit -m "chore: configure Drizzle ORM connected to Supabase"
git push
```

---

### Task 4: Schema — Meta hierarchy (accounts, campaigns, adsets, ads, creatives)

**Files:**
- Create: `lib/schema/meta.ts`, `lib/schema/auth.ts`

- [ ] **Step 1: Criar `lib/schema/auth.ts`** (referência pra users do Supabase Auth)

```ts
// lib/schema/auth.ts
// Supabase Auth gerencia a tabela auth.users automaticamente.
// Esta é uma view tipada pra referenciar via FK quando necessário.
import { pgSchema, uuid, text, timestamp } from "drizzle-orm/pg-core";

const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});
```

- [ ] **Step 2: Criar `lib/schema/meta.ts`**

```ts
// lib/schema/meta.ts
import {
  pgTable,
  bigserial,
  uuid,
  text,
  timestamp,
  bigint,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const adAccountStatus = pgEnum("ad_account_status", [
  "active",
  "paused",
  "disabled",
  "error",
]);

export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    metaAccountId: text("meta_account_id").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    currency: text("currency").notNull().default("BRL"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    status: adAccountStatus("status").notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ad_accounts_meta_id_uq").on(t.metaAccountId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adAccountId: bigint("ad_account_id", { mode: "number" })
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status").notNull(),
    dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }),
    lifetimeBudget: numeric("lifetime_budget", { precision: 14, scale: 2 }),
    startTime: timestamp("start_time", { withTimezone: true }),
    stopTime: timestamp("stop_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("campaigns_meta_id_uq").on(t.metaId),
    index("campaigns_account_idx").on(t.adAccountId),
  ],
);

export const adsets = pgTable(
  "adsets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    campaignId: bigint("campaign_id", { mode: "number" })
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }),
    targeting: jsonb("targeting").$type<Record<string, unknown>>(),
    optimizationGoal: text("optimization_goal"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("adsets_meta_id_uq").on(t.metaId),
    index("adsets_campaign_idx").on(t.campaignId),
  ],
);

export const creativeType = pgEnum("creative_type", [
  "image",
  "video",
  "carousel",
  "other",
]);

export const creatives = pgTable(
  "creatives",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metaId: text("meta_id").notNull(),
    name: text("name"),
    type: creativeType("type").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    videoUrl: text("video_url"),
    headline: text("headline"),
    body: text("body"),
    callToAction: text("call_to_action"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("creatives_meta_id_uq").on(t.metaId)],
);

export const ads = pgTable(
  "ads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adsetId: bigint("adset_id", { mode: "number" })
      .notNull()
      .references(() => adsets.id, { onDelete: "cascade" }),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    creativeId: bigint("creative_id", { mode: "number" }).references(
      () => creatives.id,
      { onDelete: "set null" },
    ),
    previewUrl: text("preview_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ads_meta_id_uq").on(t.metaId),
    index("ads_adset_idx").on(t.adsetId),
  ],
);

// Relations
export const adAccountsRelations = relations(adAccounts, ({ many }) => ({
  campaigns: many(campaigns),
}));
export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  adAccount: one(adAccounts, {
    fields: [campaigns.adAccountId],
    references: [adAccounts.id],
  }),
  adsets: many(adsets),
}));
export const adsetsRelations = relations(adsets, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [adsets.campaignId],
    references: [campaigns.id],
  }),
  ads: many(ads),
}));
export const adsRelations = relations(ads, ({ one }) => ({
  adset: one(adsets, { fields: [ads.adsetId], references: [adsets.id] }),
  creative: one(creatives, {
    fields: [ads.creativeId],
    references: [creatives.id],
  }),
}));
```

- [ ] **Step 3: Gerar migration**

```bash
npm run db:generate -- --name meta_hierarchy
```

Esperado: arquivo criado em `drizzle/0000_*.sql`.

- [ ] **Step 4: Aplicar migration no Supabase**

```bash
npm run db:migrate
```

Esperado: "migrations applied successfully".

- [ ] **Step 5: Verificar no Supabase Studio**

Abre o Supabase dashboard → Table editor. Confirma tabelas `ad_accounts`, `campaigns`, `adsets`, `ads`, `creatives` existem.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(db): add Meta hierarchy schema (accounts, campaigns, adsets, ads, creatives)"
git push
```

---

### Task 5: Schema — Insights diários

**Files:**
- Create: `lib/schema/insights.ts`

- [ ] **Step 1: Criar `lib/schema/insights.ts`**

```ts
// lib/schema/insights.ts
import {
  pgTable,
  bigserial,
  bigint,
  date,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  timestamp,
} from "drizzle-orm/pg-core";
import { ads } from "./meta";

export const adInsightsDaily = pgTable(
  "ad_insights_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adId: bigint("ad_id", { mode: "number" })
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    cpm: numeric("cpm", { precision: 14, scale: 4 }),
    ctr: numeric("ctr", { precision: 8, scale: 4 }),
    reach: integer("reach"),
    frequency: numeric("frequency", { precision: 8, scale: 4 }),
    linkClicks: integer("link_clicks"),
    videoViews: integer("video_views"),
    videoP50: integer("video_p50"),
    videoP75: integer("video_p75"),
    conversions:
      jsonb("conversions").$type<Record<string, number>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ad_insights_daily_ad_date_uq").on(t.adId, t.date),
    index("ad_insights_daily_date_idx").on(t.date),
  ],
);
```

- [ ] **Step 2: Gerar e aplicar migration**

```bash
npm run db:generate -- --name ad_insights_daily
npm run db:migrate
```

- [ ] **Step 3: Criar views materializadas via SQL bruto**

Cria arquivo de migration manual:

```bash
mkdir -p drizzle/manual
cat > drizzle/manual/001_insights_views.sql <<'EOF'
-- Agregação por adset
CREATE MATERIALIZED VIEW IF NOT EXISTS adset_insights_daily AS
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
  SUM(i.video_views) AS video_views
FROM ad_insights_daily i
JOIN ads a ON a.id = i.ad_id
GROUP BY a.adset_id, i.date;

CREATE UNIQUE INDEX IF NOT EXISTS adset_insights_daily_uq
  ON adset_insights_daily(adset_id, date);

-- Agregação por campanha
CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_insights_daily AS
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
  SUM(i.link_clicks) AS link_clicks
FROM ad_insights_daily i
JOIN ads a ON a.id = i.ad_id
JOIN adsets s ON s.id = a.adset_id
GROUP BY s.campaign_id, i.date;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_insights_daily_uq
  ON campaign_insights_daily(campaign_id, date);
EOF
```

- [ ] **Step 4: Rodar SQL manual no Supabase**

Pelo Supabase Dashboard → SQL Editor, copia e cola o conteúdo de `drizzle/manual/001_insights_views.sql` e executa. Ou via CLI:

```bash
psql "$DATABASE_URL" -f drizzle/manual/001_insights_views.sql
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): add ad_insights_daily + materialized views (adset/campaign)"
git push
```

---

### Task 6: Schema — Leads, Sales, Matches, Sync Jobs

**Files:**
- Create: `lib/schema/leads.ts`, `lib/schema/sync.ts`

- [ ] **Step 1: Criar `lib/schema/leads.ts`**

```ts
// lib/schema/leads.ts
import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ads } from "./meta";

export const leadSource = pgEnum("lead_source", [
  "meta",
  "organic",
  "unknown",
]);

export const leads = pgTable(
  "leads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    emailNormalized: text("email_normalized"),
    phoneNormalized: text("phone_normalized"),
    name: text("name"),
    source: leadSource("source").notNull().default("unknown"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    fbclid: text("fbclid"),
    fbpCookie: text("fbp_cookie"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    adId: bigint("ad_id", { mode: "number" }).references(() => ads.id, {
      onDelete: "set null",
    }),
    landingUrl: text("landing_url"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_email_idx").on(t.emailNormalized),
    index("leads_phone_idx").on(t.phoneNormalized),
    index("leads_captured_at_idx").on(t.capturedAt),
    index("leads_ad_idx").on(t.adId),
  ],
);

export const saleStatus = pgEnum("sale_status", [
  "approved",
  "refunded",
  "chargeback",
  "pending",
  "canceled",
]);

export const sales = pgTable(
  "sales",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hotmartTransactionId: text("hotmart_transaction_id").notNull(),
    status: saleStatus("status").notNull(),
    buyerEmailNormalized: text("buyer_email_normalized"),
    buyerPhoneNormalized: text("buyer_phone_normalized"),
    buyerName: text("buyer_name"),
    productId: text("product_id"),
    productName: text("product_name"),
    offerCode: text("offer_code"),
    amountBrl: numeric("amount_brl", { precision: 14, scale: 2 }),
    paymentMethod: text("payment_method"),
    currency: text("currency").notNull().default("BRL"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sales_transaction_uq").on(t.hotmartTransactionId),
    index("sales_email_idx").on(t.buyerEmailNormalized),
    index("sales_phone_idx").on(t.buyerPhoneNormalized),
    index("sales_purchased_at_idx").on(t.purchasedAt),
  ],
);

export const matchMethod = pgEnum("match_method", ["email", "phone"]);
export const matchConfidence = pgEnum("match_confidence", [
  "high",
  "medium",
  "low",
]);

export const leadSaleMatches = pgTable(
  "lead_sale_matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leadId: bigint("lead_id", { mode: "number" })
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    saleId: bigint("sale_id", { mode: "number" })
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    matchMethod: matchMethod("match_method").notNull(),
    confidence: matchConfidence("confidence").notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_sale_uq").on(t.leadId, t.saleId),
    index("lead_sale_lead_idx").on(t.leadId),
    index("lead_sale_sale_idx").on(t.saleId),
  ],
);
```

- [ ] **Step 2: Criar `lib/schema/sync.ts`**

```ts
// lib/schema/sync.ts
import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  pgEnum,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { adAccounts } from "./meta";

export const syncJobType = pgEnum("sync_job_type", [
  "meta_full",
  "meta_incremental",
  "hotmart_replay",
  "match_recompute",
  "ping",
]);

export const syncJobStatus = pgEnum("sync_job_status", [
  "queued",
  "running",
  "done",
  "failed",
]);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: syncJobType("type").notNull(),
    adAccountId: bigint("ad_account_id", { mode: "number" }).references(
      () => adAccounts.id,
      { onDelete: "cascade" },
    ),
    status: syncJobStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rowsProcessed: integer("rows_processed").default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sync_jobs_type_idx").on(t.type),
    index("sync_jobs_status_idx").on(t.status),
    index("sync_jobs_created_at_idx").on(t.createdAt),
  ],
);
```

- [ ] **Step 3: Gerar e aplicar migration**

```bash
npm run db:generate -- --name leads_sales_sync
npm run db:migrate
```

- [ ] **Step 4: Verificar no Supabase Studio** que todas as tabelas existem.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): add leads, sales, matches, sync_jobs schema"
git push
```

---

## Phase 3 — Auth + App Shell

### Task 7: Setup Supabase Auth (cliente + server helpers)

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar SSR helpers**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Criar `lib/supabase/client.ts`** (uso em Client Components)

```ts
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Criar `lib/supabase/server.ts`** (uso em Server Components / Route Handlers)

```ts
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignorado — Server Components não podem setar cookies
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Criar `middleware.ts`** (refresh de sessão + redirect)

```ts
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath = path.startsWith("/login") || path.startsWith("/auth");
  const isPublicAsset =
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path === "/api/health";

  if (!user && !isAuthPath && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(auth): wire Supabase Auth client/server/middleware"
git push
```

---

### Task 8: Login page

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`, `app/auth/callback/route.ts`

- [ ] **Step 1: Criar `app/login/actions.ts`**

```ts
// app/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Preencha email e senha" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Criar `app/login/page.tsx`**

```tsx
// app/login/page.tsx
"use client";

import { useState } from "react";
import { signInWithEmail } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function action(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await signInWithEmail(formData);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Traqueamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Criar usuário no Supabase Dashboard**

Supabase Dashboard → Authentication → Users → Add user → Create new user → email + senha do Bruno. Confirm email manualmente (toggle "Auto Confirm User").

- [ ] **Step 4: Smoke test local**

```bash
npm run dev
```

Abre `http://localhost:3000`. Esperado: redirect pra `/login`. Faz login com credenciais criadas. Esperado: redirect pra `/` (vai dar 404 porque ainda não criamos).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(auth): add login page + server actions"
git push
```

---

### Task 9: Dashboard layout (sidebar + topbar) + home vazia

**Files:**
- Create: `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`
- Create: `components/dashboard/sidebar.tsx`, `components/dashboard/topbar.tsx`

- [ ] **Step 1: Criar `components/dashboard/sidebar.tsx`**

```tsx
// components/dashboard/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Target,
  Film,
  Filter,
  Database,
  LogOut,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/gerenciador", label: "Gerenciador", icon: Target },
  { href: "/criativos", label: "Criativos", icon: Film },
  { href: "/funis", label: "Funis", icon: Filter },
  { href: "/fontes", label: "Fontes de dados", icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-16 bg-background border-r border-border flex flex-col items-center py-4 gap-1">
      {items.map((it) => {
        const Icon = it.icon;
        const active =
          it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            title={it.label}
            className={cn(
              "p-2.5 rounded-md transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
      <div className="flex-1" />
      <form action={signOut}>
        <button
          type="submit"
          title="Sair"
          className="p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </form>
    </aside>
  );
}
```

- [ ] **Step 2: Criar `components/dashboard/topbar.tsx`**

```tsx
// components/dashboard/topbar.tsx
import { Bell } from "lucide-react";

export function Topbar({ userEmail }: { userEmail: string }) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background">
      <div className="text-sm text-muted-foreground">Traqueamento</div>
      <div className="flex items-center gap-3">
        <button
          className="p-2 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div className="text-sm text-foreground">{userEmail}</div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Criar `app/(dashboard)/layout.tsx`**

```tsx
// app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar userEmail={user.email ?? ""} />
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar `app/(dashboard)/page.tsx`** (home vazia)

```tsx
// app/(dashboard)/page.tsx
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">
        Bem-vindo, {user?.email?.split("@")[0]} 👋
      </h1>
      <p className="text-muted-foreground">
        Conecta sua conta Meta e webhook Hotmart pra começar a ver dados.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Apagar `app/page.tsx` antigo** (substituído pelo grupo `(dashboard)`)

```bash
rm app/page.tsx
```

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```

Login → ver "Bem-vindo, bruno 👋" + sidebar com 5 ícones + topbar com email. Click em "Sair" → volta pro login.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(ui): dashboard layout (sidebar + topbar) + empty home"
git push
```

---

## Phase 4 — Worker

### Task 10: Bootstrap do worker (repo monorepo style)

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/src/index.ts`, `worker/src/lib/db.ts`, `worker/src/lib/redis.ts`, `worker/.env.example`

- [ ] **Step 1: Criar diretório e package**

```bash
mkdir -p worker/src/{jobs,lib}
cd worker
npm init -y
```

- [ ] **Step 2: Editar `worker/package.json`**

```json
{
  "name": "traqueamento-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 3: Instalar deps do worker**

```bash
npm install bullmq ioredis node-cron drizzle-orm postgres dotenv
npm install -D typescript tsx @types/node @types/node-cron
cd ..
```

- [ ] **Step 4: Criar `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Criar `worker/.env.example`**

```bash
cat > worker/.env.example <<'EOF'
DATABASE_URL=
REDIS_URL=
META_APP_ID=
META_APP_SECRET=
EOF
cp worker/.env.example worker/.env
```

Editar `worker/.env` com as credenciais reais (mesmas do `.env.local` raiz).

- [ ] **Step 6: Criar `worker/src/lib/db.ts`**

```ts
// worker/src/lib/db.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const client = postgres(url, { prepare: false });
export const db = drizzle(client);
```

- [ ] **Step 7: Criar `worker/src/lib/redis.ts`**

```ts
// worker/src/lib/redis.ts
import "dotenv/config";
import { Redis } from "ioredis";

const url = process.env.REDIS_URL;
if (!url) throw new Error("REDIS_URL não definida");

export const redis = new Redis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(worker): bootstrap worker package with db + redis clients"
git push
```

---

### Task 11: BullMQ queue + job "ping" + cron

**Files:**
- Create: `worker/src/queue.ts`, `worker/src/jobs/ping.ts`, `worker/src/cron.ts`, `worker/src/index.ts`

- [ ] **Step 1: Criar schema reference no worker** (compartilha com Next.js)

```bash
mkdir -p worker/src/schema
# Copia schemas (alternativa: monorepo workspace; pra simplificar inicial, duplica)
cp -r lib/schema/* worker/src/schema/
```

- [ ] **Step 2: Atualizar import no `worker/src/lib/db.ts`**

Editar `worker/src/lib/db.ts`:

```ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const client = postgres(url, { prepare: false });
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: Criar `worker/src/queue.ts`**

```ts
// worker/src/queue.ts
import { Queue, Worker, type Job } from "bullmq";
import { redis } from "./lib/redis.js";
import { runPingJob } from "./jobs/ping.js";

export const QUEUE_NAME = "traqueamento";

export const queue = new Queue(QUEUE_NAME, { connection: redis });

export type JobName = "ping" | "syncMeta" | "processHotmart" | "recomputeMatches";

export function createWorker() {
  return new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      switch (job.name as JobName) {
        case "ping":
          return runPingJob();
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    { connection: redis, concurrency: 1 },
  );
}
```

- [ ] **Step 4: Criar `worker/src/jobs/ping.ts`**

```ts
// worker/src/jobs/ping.ts
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { syncJobs } from "../schema/sync.js";

export async function runPingJob() {
  const startedAt = new Date();
  const [row] = await db
    .insert(syncJobs)
    .values({ type: "ping", status: "running", startedAt })
    .returning({ id: syncJobs.id });

  // Trabalho real: nada — só registra heartbeat.
  await new Promise((r) => setTimeout(r, 100));

  await db
    .update(syncJobs)
    .set({ status: "done", finishedAt: new Date(), rowsProcessed: 0 })
    .where(eq(syncJobs.id, row.id));

  console.log(`[ping] ok (job_id=${row.id})`);
  return { id: row.id };
}
```

- [ ] **Step 5: Criar `worker/src/cron.ts`**

```ts
// worker/src/cron.ts
import cron from "node-cron";
import { queue } from "./queue.js";

export function startCron() {
  // 4x por dia: 06h, 12h, 18h, 23h (America/Sao_Paulo)
  cron.schedule(
    "0 6,12,18,23 * * *",
    async () => {
      await queue.add("ping", {}, { removeOnComplete: 100, removeOnFail: 50 });
      console.log("[cron] ping enfileirado");
    },
    { timezone: "America/Sao_Paulo" },
  );

  console.log("[cron] agendado para 06h, 12h, 18h, 23h (SP)");
}
```

- [ ] **Step 6: Criar `worker/src/index.ts`**

```ts
// worker/src/index.ts
import "dotenv/config";
import { createWorker } from "./queue.js";
import { startCron } from "./cron.js";

async function main() {
  const worker = createWorker();
  worker.on("completed", (job) => console.log(`[worker] done: ${job.name}`));
  worker.on("failed", (job, err) =>
    console.error(`[worker] failed: ${job?.name}`, err),
  );

  startCron();
  console.log("[worker] rodando");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 7: Smoke test local do worker**

```bash
cd worker
npm run dev
```

Em outro terminal, enfileira manualmente um ping:

```bash
node -e "
const { Queue } = require('bullmq');
const Redis = require('ioredis');
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const q = new Queue('traqueamento', { connection: r });
q.add('ping', {}).then(() => process.exit(0));
" 
```

Ou no Supabase SQL Editor:

```sql
SELECT * FROM sync_jobs ORDER BY created_at DESC LIMIT 5;
```

Esperado: linha `type=ping, status=done`.

`Ctrl+C` no worker.

- [ ] **Step 8: Commit**

```bash
cd ..
git add .
git commit -m "feat(worker): BullMQ queue + ping job + cron 4x/dia"
git push
```

---

### Task 12: Provisionar VPS + deploy do worker com pm2

**Files:**
- Create: `worker/ecosystem.config.cjs`, `scripts/deploy-worker.sh`

- [ ] **Step 1: Acesso inicial à VPS**

Do Mac:

```bash
ssh root@<IP_DA_VPS>
```

(Senha do Hostinger ou chave SSH se já configurou.)

- [ ] **Step 2: Setup inicial da VPS** (rodar dentro da sessão SSH)

```bash
# Atualizar sistema
apt update && apt upgrade -y

# Criar usuário não-root
adduser deploy
usermod -aG sudo deploy

# Copiar chave SSH (se já fez ssh-copy-id como root, copia pro deploy)
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Firewall básico
ufw allow OpenSSH
ufw enable

# Instalar Node 20 LTS via nvm
su - deploy
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm alias default 20

# Instalar pm2
npm install -g pm2
exit  # volta pra root

# Sair da VPS
exit
```

- [ ] **Step 3: Criar `worker/ecosystem.config.cjs`**

```js
// worker/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "traqueamento-worker",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "300M",
      autorestart: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

- [ ] **Step 4: Criar `scripts/deploy-worker.sh`**

```bash
#!/usr/bin/env bash
# scripts/deploy-worker.sh
# Uso: ./scripts/deploy-worker.sh deploy@<IP>
set -euo pipefail

REMOTE="$1"
APP_DIR="/home/deploy/traqueamento-worker"

echo "[1/4] Build local..."
cd worker
npm run build
cd ..

echo "[2/4] Sync de arquivos via rsync..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude src \
  worker/ "$REMOTE:$APP_DIR/"

echo "[3/4] Sync do .env (separado pra não sobrescrever sem querer)..."
scp worker/.env "$REMOTE:$APP_DIR/.env"

echo "[4/4] Install + restart..."
ssh "$REMOTE" "cd $APP_DIR && npm install --omit=dev && pm2 startOrReload ecosystem.config.cjs && pm2 save"

echo "✅ deploy concluído"
```

```bash
chmod +x scripts/deploy-worker.sh
```

- [ ] **Step 5: Primeiro deploy**

```bash
./scripts/deploy-worker.sh deploy@<IP_DA_VPS>
```

Na primeira vez, configurar pm2 startup:

```bash
ssh deploy@<IP> "pm2 startup systemd -u deploy --hp /home/deploy"
# Copiar o comando que pm2 imprime e rodar como root:
# sudo env PATH=$PATH:/home/deploy/.nvm/versions/node/v20.x.x/bin /home/deploy/.nvm/versions/node/v20.x.x/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy
```

- [ ] **Step 6: Verificar worker rodando**

```bash
ssh deploy@<IP> "pm2 status && pm2 logs traqueamento-worker --lines 20"
```

Esperado: `online` + log `[worker] rodando` + `[cron] agendado`.

- [ ] **Step 7: Validação end-to-end**

Espera o próximo horário de cron (06h/12h/18h/23h SP) ou enfileira manual:

```bash
ssh deploy@<IP> "cd /home/deploy/traqueamento-worker && node -e \"const{Queue}=require('bullmq');const r=require('ioredis');const c=new r(process.env.REDIS_URL,{maxRetriesPerRequest:null});new Queue('traqueamento',{connection:c}).add('ping',{}).then(()=>process.exit(0))\""
```

Confirma no Supabase: nova linha `type=ping, status=done` em `sync_jobs`.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(deploy): VPS provisioning + pm2 + deploy script for worker"
git push
```

---

## Phase 5 — Ship

### Task 13: API route /api/sync/refresh + GitHub Actions CI

**Files:**
- Create: `app/api/sync/refresh/route.ts`, `app/api/health/route.ts`, `.github/workflows/ci.yml`

- [ ] **Step 1: Criar `app/api/health/route.ts`**

```ts
// app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
```

- [ ] **Step 2: Criar `app/api/sync/refresh/route.ts`**

```ts
// app/api/sync/refresh/route.ts
import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const redis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue("traqueamento", { connection: redis });

  // Por enquanto só ping; sub-projeto 2 troca pra "syncMeta"
  const job = await queue.add("ping", { triggeredBy: user.email });

  await redis.quit();
  return NextResponse.json({ jobId: job.id });
}
```

- [ ] **Step 3: Adicionar deps necessárias no app**

```bash
npm install bullmq ioredis
```

- [ ] **Step 4: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
          DATABASE_URL: postgres://placeholder

  worker:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: worker
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: worker/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
```

- [ ] **Step 5: Smoke test local**

```bash
npm run dev
```

Em outro terminal (logado):

```bash
curl http://localhost:3000/api/health
# {"status":"ok","ts":"..."}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: /api/health + /api/sync/refresh + GitHub Actions CI"
git push
```

Conferir no GitHub: workflow rodou e ficou verde.

---

### Task 14: Deploy Vercel + smoke test em produção

**Files:**
- Modify: `next.config.ts` (se necessário)

- [ ] **Step 1: Importar projeto no Vercel**

Vercel Dashboard → Add New → Project → seleciona o repo `traqueamento`.

Framework: Next.js (auto-detect).
Root directory: `./`
Build command: padrão (`next build`).

**Environment variables** (todas as do `.env.example` que já existem):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `REDIS_URL`

Click **Deploy**.

- [ ] **Step 2: Aguardar build + acessar URL `*.vercel.app`**

Esperado: redirect pra `/login`. Faz login. Vê home "Bem-vindo, bruno 👋".

- [ ] **Step 3: Smoke test do refresh em produção**

Logado, abre DevTools → Console:

```js
fetch("/api/sync/refresh", { method: "POST" }).then(r => r.json()).then(console.log);
// {"jobId":"..."}
```

Espera ~10s, confere no Supabase:

```sql
SELECT * FROM sync_jobs WHERE type = 'ping' ORDER BY created_at DESC LIMIT 3;
```

Última linha deve ter `status=done`.

- [ ] **Step 4: Configurar domínio próprio (opcional, dá pra deixar pra depois)**

Vercel → Project Settings → Domains → Add `<seu-dominio.com>`.

- [ ] **Step 5: Atualizar `CLAUDE.md` com estado atualizado**

```bash
# Adicionar/atualizar seção "Estado atual" em CLAUDE.md
```

Editar manualmente `CLAUDE.md`, substituir bloco "Estado atual (2026-05-04)" por:

```markdown
## Estado atual (2026-05-XX)

- Sub-projeto 1 (Infra + Schema) **concluído**
- Stack: Next.js 15 + Supabase + Drizzle + BullMQ + Vercel + VPS Hostinger BR
- Login funcional, schema completo aplicado, worker rodando ping 4x/dia
- Próximo sub-projeto: **Meta Ads API** (coleta de campanhas, criativos, insights)
```

- [ ] **Step 6: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: mark sub-project 1 (infra+schema) as complete"
git push
```

---

## Self-review checklist (faço sozinho antes de entregar pro Bruno)

- [x] Coverage da spec: cada decisão da spec aparece em uma task
- [x] Sem placeholders (sem TBD, sem "implement later", sem "similar to Task N")
- [x] Comandos completos com output esperado
- [x] Schemas completos (não pseudocódigo)
- [x] Order de dependências: cada task pode ser feita após as anteriores estarem prontas

## Definition of Done deste sub-projeto

1. ✅ `npm run db:migrate` aplica schema completo do zero numa Supabase nova
2. ✅ `https://<dominio-vercel>.vercel.app` redireciona pra `/login`
3. ✅ Login com email/senha funciona, leva pra home com "Bem-vindo, X 👋"
4. ✅ POST `/api/sync/refresh` (autenticado) cria job no Redis, worker consome e grava `done` em `sync_jobs`
5. ✅ Cron na VPS dispara `ping` 4x/dia automaticamente (verificável em `sync_jobs`)
6. ✅ CI verde no GitHub a cada push
7. ✅ `CLAUDE.md` atualizado refletindo estado real

---

## Próximos sub-projetos (não inclusos aqui)

- **Sub-projeto 2:** Meta Ads API client + job `syncMeta` + tela de "Conectar conta Meta"
- **Sub-projeto 3:** Telas com dados reais (Home, Gerenciador, Criativos)
- **Sub-projeto 4:** Webhook Hotmart + serviço de match lead↔venda
- **Sub-projeto 5:** Pixel próprio + score de qualidade orgânico
