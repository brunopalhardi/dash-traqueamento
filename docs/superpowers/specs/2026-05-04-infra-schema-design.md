# Sub-projeto 1: Infra + Schema — Design

**Data:** 2026-05-04
**Autor:** Bruno + Claude
**Status:** Aprovado, pronto pra implementação

## Contexto

Dashboard próprio de tráfego pago + vendas, inspirado no VK Metrics. Uso primário interno (infoproduto "O Bom do Alzheimer"); uso secundário potencial como SaaS no futuro (problema do Rafa quando chegar lá).

Ver [CLAUDE.md](../../../CLAUDE.md) para contexto geral. Ver `docs/superpowers/specs/` para outros sub-projetos.

## Decomposição em sub-projetos

1. **Infra + Schema** ← este documento
2. Meta Ads API (coleta + sync)
3. Frontend esqueleto (telas com dados reais)
4. Hotmart webhook + match lead↔venda
5. Rastreamento orgânico + score de qualidade

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Multi-tenant | Não (single-tenant) | MVP rápido. Refator quando virar produto, com Rafa. |
| Hosting app | Vercel (free) | Deploy/SSL/uptime resolvidos. |
| Hosting workers | VPS BR Hostinger ~R$20/mo | Jobs longos do Meta API não cabem em serverless. |
| Banco | Supabase Postgres | Já vem com Auth + Realtime. |
| Auth | Supabase Auth | Multi-usuário desde dia 1 (Bruno + outros gestores). |
| Granularidade Meta | Espelho completo (account/campaign/adset/ad + insights diários) | Permite qualquer recorte sem depender da API. |
| Histórico Meta | 60 dias na primeira sync | Suficiente; Bruno não fez lançamentos recentes. |
| Sync Meta | 4x/dia + botão "atualizar agora" | Não estoura quota; UX de refresh manual quando precisar. |
| Match lead↔venda | Email + telefone (normalizados) | Cobertura ~95%, simples. fbclid/pixel próprio fica pra v2. |

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 15 + App Router + TypeScript |
| UI | shadcn/ui + Tailwind |
| Charts | Recharts (line/bar) + D3 custom (funil de tráfego) |
| ORM | Drizzle |
| Worker | Node.js + node-cron + BullMQ |
| Queue | Upstash Redis (free tier) |
| Auth | Supabase Auth |
| Deploy app | Vercel |
| Deploy worker | VPS BR (Hostinger), pm2 |

## Arquitetura

```
Browser → Vercel (Next.js)
              ↓ pg              ↓ enqueue
         Supabase Postgres   Upstash Redis
              ↑ writes           ↓ pull
              └────── VPS Worker (cron + BullMQ consumer)
```

Next.js lê direto do Postgres via Server Components (sem REST intermediária).
Workers ficam isolados na VPS — se um job pesado travar, o app não cai.

## Schema

### Auth & contas Meta
- `users` — gerenciado pelo Supabase Auth
- `ad_accounts` — id, name, meta_account_id, access_token (encrypted), currency, timezone, status, last_sync_at

### Hierarquia Meta (espelho)
- `campaigns` — ad_account_id, meta_id, name, objective, status, daily_budget, lifetime_budget, start_time, stop_time
- `adsets` — campaign_id, meta_id, name, status, daily_budget, targeting (jsonb), optimization_goal
- `ads` — adset_id, meta_id, name, status, creative_id, preview_url
- `creatives` — meta_id, name, type, thumbnail_url, video_url, headline, body, call_to_action

### Métricas
- `ad_insights_daily` — ad_id, date, impressions, clicks, spend, cpm, ctr, reach, frequency, link_clicks, video_views, video_p50, video_p75, conversions (jsonb)
- `campaign_insights_daily`, `adset_insights_daily` — views materializadas, refresh ao fim de cada sync

### Leads + vendas
- `leads` — email_normalized, phone_normalized, name, source, utm_*, fbclid, fbp_cookie, ip, user_agent, ad_id (nullable), captured_at, landing_url
- `sales` — hotmart_transaction_id, status, buyer_email_normalized, buyer_phone_normalized, buyer_name, product_id, product_name, offer_code, amount_brl, payment_method, currency, purchased_at, refunded_at, raw_payload (jsonb)
- `lead_sale_matches` — lead_id, sale_id, match_method, matched_at, confidence

### Sincronização
- `sync_jobs` — type (meta_full/meta_incremental/hotmart_replay), ad_account_id, status, started_at, finished_at, rows_processed, error_message

### Normalizações
- `email_normalized` = lowercase + trim
- `phone_normalized` = só dígitos com prefixo BR (`+55XXXXXXXXXXX`)

### Por que `raw_payload` em `sales`
Se descobrirmos bug no parsing do webhook Hotmart, dá pra reprocessar a partir do payload bruto, sem precisar pedir replay pra Hotmart.

## Estrutura do repo

```
app/
├── (auth)/login
├── (dashboard)/
│   ├── layout.tsx       (sidebar + topbar)
│   ├── page.tsx         (home)
│   ├── gerenciador/
│   ├── criativos/
│   └── desafio/         (produto semanal — sub-projeto futuro)
├── api/
│   ├── webhooks/hotmart/route.ts
│   └── sync/refresh/route.ts
└── lib/{db,supabase,auth}.ts

drizzle/                 (migrations versionadas)
components/ui/           (shadcn/ui)
components/charts/       (Recharts wrappers + funil custom)

worker/
├── src/{index,cron,queue}.ts
├── src/jobs/ping.ts     (sub-projeto 1)
├── src/jobs/syncMeta.ts (sub-projeto 2)
└── src/lib/db.ts
```

## Entregável

Ao fim deste sub-projeto:
1. `https://<dominio>/login` funciona com Supabase Auth
2. Home vazia ("Bem-vindo, Bruno") acessível pós-login
3. Schema completo aplicado no Supabase (tabelas vazias)
4. VPS provisionada, worker rodando, job "ping" gravando em `sync_jobs` a cada 4h
5. Repo GitHub com CI (typecheck + build) verde
6. Documentação de operação (como deployar, como rodar local)

Sub-projeto 2 começa do estado final deste.

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Token Meta vencer (60 dias) | Job de refresh agendado + alerta por email se falhar |
| VPS cair | pm2 com restart automático + healthcheck via UptimeRobot (free) |
| Schema mudar muito | Migrations versionadas com Drizzle desde o dia 1 |
| Vazar `access_token` Meta | Encryption at rest + env vars apenas, nunca no repo |
