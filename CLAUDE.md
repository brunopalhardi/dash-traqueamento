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

## Estado atual (2026-05-16)

### Concluído

- ✅ **Sub-projeto 1 (Infra + Schema)** — deployado em https://dash-traqueamento.vercel.app, login Supabase (`admin@traqueamento.com`), cron diário 02h SP
- ✅ **Sub-projeto 2 (Meta Ads API)** — cliente Graph v25, sync com filtro `effective_status=ACTIVE`, captura de leads/purchases/revenue do Pixel (dedupe por `pickByPriority` pra evitar contar omni+pixel+purchase 3x), reaper de jobs órfãos (Vercel timeout). Manual mode = `last_30d`, daily = `last_7d`. Creatives skipados no daily/manual pra caber no timeout.
- ✅ **Sub-projeto 3 (5 dashboards)** — Geral / C1 / Desafio / Sono / Guia, com tema gold (inspirado no CliniFunnel `/Users/macintosh/Documents/Claude.Code/clinifunnel`), fonte Inter, sidebar com brand block, topbar com breadcrumb + botão Sincronizar inline. Catálogo em `lib/products.ts` mapeia produto→conta+regex.
- ✅ **Instagram (estrutura)** — schema (ig_accounts, ig_insights_daily, ig_media, ig_media_insights), cliente Graph v25, sync, endpoint `/api/instagram/sync`, página `/instagram` com KPIs + grid de posts. **Aguardando Bruno configurar** `IG_ACCESS_TOKEN` na Vercel + inserir row em `ig_accounts` (token já tá no `Secret KEYs/tokens.md`, mas `IG Page ID` na planilha parece curto demais — pode ser FB Page, não IG Business — confirmar)
- ✅ **Desafio Fase 1** (commit `5d473d9`) — CycleSelector (7d/14d/15d/Custom), `getCycleOverlay`, eixo X dinâmico (Seg..Dom pra 7d, Dia 1..N pros outros)
- ✅ **Desafio Fase 2** (commit `b07821d`) — painéis Tráfego (funil), Qualidade (donut score 0-100 com pesos ROAS 40% / CPL 30% / Tx.Conv 30%), Top criativos, tabela hierárquica (Campanhas/Conjuntos/Anúncios com search+sort+totals)
- ✅ **Desafio Fase 3** (commit `8a7ffb9`) — captura de UTMs orgânicas: `public/track.js` auto-attach em forms, `/api/track/lead` classifica source (meta se fbclid/`utm_medium=paid`; organic se `utm_medium=organic` ou `utm_source=organic_*`), painel "Orgânico" em /desafio (total + barras por origem + bar chart diário)
- ✅ **Hotmart webhook + tabela purchases** — `/api/webhooks/hotmart` aceita `PURCHASE_APPROVED/REFUNDED/CHARGEBACK`; idempotência via `transaction_id`; match com grupo WhatsApp via `buyer_phone_e164` normalizado. (Spec/plano: `docs/superpowers/specs/2026-05-17-poda-foco-desafio-guia-design.md`)

### Pendências imediatas (em ordem)

1. **Bruno validar números em produção** — comparar /desafio (Fases 1-3) com Gerenciador Meta + planilha de leads + VK Metrics. Reportar divergências; eu fixo antes de seguir.
2. **Mini-Fase 3.5** (~1h, não iniciada) — (a) adaptar classifier do `/api/track/lead` pra convenção real do Bruno (planilha usa `utm_source=Organico|MetaAds`, não `utm_medium=organic`); (b) `track.js` reescrever links `<a href*="hotmart.com">` injetando `src=` com os UTMs do cookie pra atribuição sobreviver ao pulo LP→checkout
3. **Fase 4 — SendFlow** (~2-3h) — webhook recebe entrada/saída de grupo, persiste em tabelas novas. Bruno precisa gerar `SENDFLOW_WEBHOOK_TOKEN` e cadastrar webhook no painel
4. **Bruno cadastrar Hotmart webhook em produção** — gerar `HOTTOK` na Vercel e cadastrar webhook no painel Hotmart apontando pra `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` com eventos `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`.

### Plano detalhado do Desafio (com bug-tracking)

[docs/superpowers/plans/2026-05-13-desafio-deep-dive.md](docs/superpowers/plans/2026-05-13-desafio-deep-dive.md)

### Convenção de UTMs real (vista na planilha do Bruno)

A planilha usa:
- `utm_source`: `Organico` ou `MetaAds` (origem ampla, classifica paid vs organic)
- `utm_campaign`: `Desafio7D` / `B-VENDAS-DESAFIO-F-LP1` / `Grupos-Antigos` (funil/produto)
- `utm_medium`: `Instagram` / `Whatsapp` / `01-Q` (canal específico)
- `utm_content`: `Reels` / `AD10-IMG-DESAFIO` (criativo)

**Diverge** da convenção proposta no plano original (`utm_medium=organic`). O classifier do `/api/track/lead` precisa entender ambos — fix planejado pra Mini-Fase 3.5.

### Secret KEYs

Diretório `Secret KEYs/` (gitignored) com `tokens.md` consolidando todos os secrets (Meta Ads, Meta IG, Supabase, Vercel, Upstash, Hotmart placeholders). Espelha o `~/.traqueamento-secrets/credentials.env` antigo.
