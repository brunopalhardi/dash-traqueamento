@AGENTS.md

# Dashboard Traqueamento — Contexto do Projeto

Dashboard próprio de tráfego pago + vendas, inspirado no **VK Metrics** (vkmetrics.com). Plano: extrair referências de UI/estrutura do VK e construir versão própria.

## Objetivo

- **Uso primário:** interno (gestão de tráfego do próprio infoproduto do Bruno — "O Bom do Alzheimer")
- **Uso secundário (eventual):** virar SaaS pra outros gestores → arquitetura preparada pra multi-tenant no futuro

## Escopo do MVP

1. **Centralizador de métricas** — Meta Ads (Google Ads em standby pra v2)
2. **Monitoramento por campanha** — CPL, gasto, leads, vendas, dia-a-dia
3. **Análise de criativos** — métricas por anúncio/criativo
4. **Relatórios automáticos** — tráfego, faturamento, conversão, CPL
5. **Match lead → compra** via email/telefone (Hotmart webhook + dados do Meta)

**Fora do MVP:** Lead scoring com ML, Google Ads, TikTok.

## Integrações

- **Meta Ads API** — pull de campanhas, conjuntos, anúncios, métricas
- **Hotmart** — webhook de vendas
- **(futuro)** Google Ads, pesquisa de persona pra lead scoring

## Volume esperado

- 3 contas de anúncio
- Baseline baixo no dia-a-dia
- Pico de ~20k leads/mês em lançamento

## Stack (definida em sub-projeto 1)

- **App:** Next.js 15 + App Router + TypeScript (Vercel)
- **UI:** shadcn/ui + Tailwind, Recharts pra gráficos
- **Banco:** Supabase Postgres + Auth
- **ORM:** Drizzle
- **Worker:** Node.js + BullMQ + Upstash Redis (rodando em VPS BR Hostinger)
- **Multi-tenant:** adiado (single-tenant agora; refator com Rafa quando virar SaaS)

## Time

- **Bruno** mantém sozinho no início (programa, opera tráfego)
- **Rafa** — dev, vizinho do Bruno, possível sócio se virar produto pra terceiros

## Documentação interna

- Spec do sub-projeto 1: [docs/superpowers/specs/2026-05-04-infra-schema-design.md](docs/superpowers/specs/2026-05-04-infra-schema-design.md)
- Plano sub-projeto 1: [docs/superpowers/plans/2026-05-04-infra-schema.md](docs/superpowers/plans/2026-05-04-infra-schema.md)

## Estado atual (2026-05-17)

Dashboard focado em **Desafio + Guia**. Tudo de C1, Sono, Instagram e tracking-JS foi removido na poda 2026-05-17 (spec/plano: `docs/superpowers/specs/2026-05-17-poda-foco-desafio-guia-design.md`, `docs/superpowers/plans/2026-05-17-poda-foco-desafio-guia.md`).

### Clonar pra novo cliente (estratégia atual: 1 repo fork + 1 Supabase por cliente)

1. Fork/clone do repo + novo projeto Vercel + novo Supabase (rodar migrations: `npm run db:migrate`)
2. Editar **`lib/client-config.ts`** (único arquivo de código): BRAND, produtos, contas Meta (`act_…`), regex de nomenclatura de campanha, rotas/visual
3. Criar as rotas de produto (`app/(dashboard)/<slug>/page.tsx`) espelhando `/guia` — ainda não são dinâmicas
4. Preencher TODAS as vars do `.env.example` na Vercel
5. Cadastrar webhooks no painel do cliente: Hotmart (`/api/webhooks/hotmart`, eventos PURCHASE_APPROVED/REFUNDED/CHARGEBACK) e SendFlow (`/api/webhooks/sendflow?token=…`)
6. Ativar contas Meta em `/settings/integrations` e rodar `/api/sync/refresh?mode=backfill`
7. Validar: gasto por produto vs Gerenciador de Anúncios, receita vs painel Hotmart, `scripts/diag-guia-spend.ts` adaptado

### Rotas vivas

- `/` — Visão Geral consolidada (Desafio + Guia)
- `/desafio` — KPIs semanais + ciclos comparados + Tráfego + Top Criativos + **Compradores da semana** (com ✅/❌ "no grupo") + GroupPanel
- `/guia` — espelhado do Desafio, sem coluna "no grupo" (Guia não tem grupo WhatsApp) + card **"Páginas ativas · vídeo (VSL)"** (métricas VTurb por página)
- `/guia/pagina/[pageId]` — drill-down VTurb: curva de retenção + linha do pitch + evolução diária de tempo médio
- `/settings/integrations` — toggle contas Meta + painel **VTurb · mapeamento manual** página→player
- `/login`
- `/api/webhooks/sendflow`, `/api/webhooks/hotmart`, `/api/sync/*` (inclui `/api/sync/vturb`), `/api/vturb/map`, `/api/meta/*`, `/api/health`

### Stack ativa

- Meta Ads sync (Graph v25, cron diário 02h SP, reaper de jobs órfãos)
- SendFlow webhook → tabelas `whatsapp_*` (entrada/saída de grupo)
- Hotmart webhook → tabela `purchases` (PURCHASE_APPROVED/REFUNDED/CHARGEBACK, idempotente por `transaction_id`). **Classificação de produto da compra** = `classifyPurchaseProduct()` em `lib/products.ts`, por **identidade do produto Hotmart** (registro `HOTMART_PRODUCTS`: id `6753137`/nome "GUIA ALZHEIMER - O PRIMEIRO PASSO PARA CUIDAR" → guia; id `7523998`/nome "Desafio O Bom do Alzheimer" → desafio; resto → outros). Id quando o payload traz (webhook v2); nome exato como fallback (sync via API só tem nome). **Pra adicionar produto, edite o registro lá.**
- Match comprador↔grupo via `buyer_phone_e164 ↔ whatsapp_group_members.phone_normalized` (E.164 normalizado em ambos os lados via `lib/utils/phone.ts`)
- **VTurb sync** (cron diário 08h UTC, `/api/sync/vturb`) → métricas de VSL por **página ativa do Guia**. 4 passos: catálogo de players → descobre páginas ativas (URLs de anúncios ACTIVE) → resolve player_id por **scrape do HTML** do embed (fallback manual em settings) → puxa métricas da Analytics API VTurb e faz upsert em 5 tabelas (`vturb_players/pages/page_players/page_daily/retention_daily`). Junta com gasto/venda do Meta por **URL normalizada**. Soma mobile+desktop e **recalcula taxas a partir do total** (não média de médias). Lógica pura testada em `lib/vturb/*`. Saúde da página (🟢 mapeado / 🟡 sem embed / 🔴 404) vira badge na tabela. Spec/plano: `docs/superpowers/{specs,plans}/2026-06-08-vturb-integration*.md`.

### Pendências imediatas

1. **Bruno cadastrar Hotmart webhook em produção** — setar `HOTTOK` na Vercel e cadastrar webhook no painel Hotmart apontando pra `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` com eventos `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`. Sem isso, "Compradores da semana" fica vazia.
2. **Bruno disponibilizar planilha de UTMs** — quando disponível, monto importador da planilha pra popular a tabela `leads` (preservada, mas hoje vazia). Depois cruza com `purchases.buyer_phone_e164` pra atribuição cria→venda.
3. **(Pré-existente) Materialized views Postgres** — `adset_insights_daily` e `campaign_insights_daily` existem em prod mas não estão declaradas no schema Drizzle. `db:push` dropariam ambas. **Nunca usar `db:push` em prod** — sempre `drizzle-kit migrate`. (Declarar as MVs no schema continua pendente.)
   > **Resolvido 2026-06-09 (parte do migrate):** o `db:migrate` estava quebrado — migrations `0013` (sendflow_leadscoring), `0014` (ads.landing_url) e `0015` (vturb) tinham os efeitos **já aplicados em prod** (provavelmente por `db:push` antigo) mas **não estavam gravadas no `drizzle.__drizzle_migrations`**. Resultado: `0014 ADD COLUMN` abortava com "column already exists" e travava o chain antes da `0015`. Reconciliei inserindo as 3 linhas no journal (hash + `created_at` do `_journal.json`), sem editar migrations. `db:migrate` voltou a rodar limpo (EXIT 0). **Lição:** `db:push` aplica schema mas NÃO grava no journal → quebra `db:migrate` depois. Ver `[[drizzle-db-push-quebra-migrate]]` no vault-trabalho.
4. **Bruno setar `VTURB_API_TOKEN` na Vercel** (Production env var) — sem isso o cron `/api/sync/vturb` (08h UTC) falha em prod. Token está no `.env.local` e em `Secret KEYs/tokens.md`. Backfill local de 30 dias já rodou (10 páginas ativas, 5 com vídeo, 85 dias). **Achado da feature:** 2 anúncios ativos apontam pra páginas 404 (`guia-alzheimer-pa-ex-v3`, `pb-ex-v3`) — gasto em página morta, conferir no Meta.

### Follow-ups não-bloqueantes

- Helpers de parse (`asObj`/`pick`/`toDate`) duplicados entre `app/api/webhooks/sendflow/route.ts` e `lib/hotmart/parser.ts` — extrair pra `lib/utils/webhook-parse.ts` quando aparecer o 3º consumer.
- `lib/schema/leads.ts` ainda define tabelas `sales` e `lead_sale_matches` que foram superseded pela `purchases`. Manter `leads` (importador da planilha), considerar deletar as outras 2 quando puder migration de DROP.

### Convenção de UTMs (planilha do Bruno)

- `utm_source`: `Organico` ou `MetaAds`
- `utm_campaign`: `Desafio7D` / `B-VENDAS-DESAFIO-F-LP1` / `Grupos-Antigos`
- `utm_medium`: `Instagram` / `Whatsapp` / `01-Q`
- `utm_content`: `Reels` / `AD10-IMG-DESAFIO`

### Atribuição de venda orgânico vs pago (implementado 2026-06)

Cada venda Hotmart é classificada em `purchases.traffic_source` = `trafego | organico | sem_atribuicao` pelo parser `lib/hotmart/tracking.ts` (lê o `sck`/`utm_*` do raw_payload). Dashboard mostra split de receita + ROAS de tráfego + ROAS por campanha (match `utm_campaign` ↔ `campaigns.name`). Captura: parâmetros de URL nos anúncios Meta (pago) + snippet `public/t.js` nas LPs (orgânico). Detalhes e template em `docs/tracking-utm.md`. Reprocessar histórico: `npx tsx --env-file=.env.local scripts/backfill-tracking.ts` (idempotente). Pendência: confirmar a fonte do sck atual via leitura de url_tags do Meta (bloqueado pela instabilidade do Meta em 2026-06-12).

### Convenção de nomes de campanha (Meta) → atribuição por produto

A atribuição de **gasto/tráfego** a cada produto é por **conta Meta + regex no nome da campanha** (`namePattern` em `lib/products.ts`). ⚠️ **Mecanismo distinto** da atribuição de **venda/receita**, que é por **produto Hotmart** (`classifyPurchaseProduct`/`HOTMART_PRODUCTS`, ver "Stack ativa"). Não confundir: regex de campanha ≠ identidade de produto. (Bug histórico 2026-06-09: a classificação de venda usava substring `/guia/i` no nome do produto, varrendo ebook de Sono + Guia de Viagem pro `/guia` e inflando ROAS — corrigido pra id+nome exato.) Por isso a nomenclatura importa: se uma campanha não casa o regex, o gasto dela **some silenciosamente** do dashboard (mas a receita vem do Hotmart por `productSlug`, então fica descasado → ROAS fantasma). Convenção atual do Bruno:

- **Guia** (`act_972744231680763` — "CA01 - OBA - FUNIS"):
  - `B-PERPETUO-GA-…` — campanhas do Guia (`GA` = Guia do Alzheimer). Divididas por **grupo**: `B-PERPETUO-GA-GRUPO-EXAUSTÃO-A/B/C`. Hoje só existe o grupo **EXAUSTÃO**; futuramente entra **SONO** e outros (`-GRUPO-SONO-…`).
  - `B-PERPETUO-GUIA-F-Remarketing …` — remarketing do Guia (Checkout/Página).
  - `[C1] Post do Instagram: …` — **NÃO é Guia**. É post impulsionado avulso; deve entrar só como **gasto geral no dash Geral**, não no Guia.
  - Regex vivo: `/PERPETUO-GA|PERPETUO-GUIA|GUIA.*OBA/i`.
- **Desafio** (`act_1394993860878989` — "CA02 - OBA - LANÇAMENTOS"): `…VENDAS-DESAFIO…`. Regex `/VENDAS-DESAFIO/i`.

> Bug histórico (corrigido 2026-06-08): regex do Guia era só `PERPETUO-GUIA|GUIA.*OBA`, então só pegava o remarketing (R$ 11,34) e ignorava ~R$ 1.124 das campanhas `PERPETUO-GA`. Ao mexer em nomenclatura, conferir aqui e no `lib/products.ts`. Diag rápido: `scripts/diag-guia-spend.ts`.

**Roadmap pedido pelo Bruno (ainda não implementado):** quebrar a visualização do Guia por grupo (EXAUSTÃO/SONO/…), isolar o gasto de remarketing e mostrar vendas atribuídas a ele (limitação: venda vem do Hotmart sem link de campanha; só o Meta tem purchase por campanha, e não bate). Brainstorm/plano pendente.

### Secret KEYs

Diretório `Secret KEYs/` (gitignored) com `tokens.md` consolidando todos os secrets (Meta Ads, Meta IG, Supabase, Vercel, Upstash, Hotmart placeholders). Espelha o `~/.traqueamento-secrets/credentials.env` antigo.
