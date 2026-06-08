# Integração VTurb — Retenção de VSL por página (Guia) — Design

**Data:** 2026-06-08
**Status:** rascunho — aguardando aprovação do Bruno

## Contexto e objetivo

O Guia roda VSLs (vídeos de venda) hospedados no **VTurb** em páginas Lovable (`guia-alzheimer-*.lovable.app`). Hoje o dash sabe **gasto** (Meta) e **venda** (Hotmart), mas não sabe **o que acontece dentro do vídeo** — quanto a audiência assiste, quantos chegam na oferta. O objetivo é trazer as métricas de vídeo do VTurb pro dash, **por página ativa**, pra responder: **qual página converte mais e por quê** (retenção/tempo médio).

Escopo: **só `/guia`** (não `/desafio` por enquanto). Arquitetura preparada pra estender a outros produtos depois.

### Prova de conceito (já executada, 2026-06-08)

PoC validou o caminho ponta a ponta com dados reais (`scripts/diag-vturb-poc.ts`):
- URLs de anúncios ativos do Guia vêm do banco (Meta) → todas `*.lovable.app`.
- Scrape do HTML extrai o `player_id` do embed ConverteAI/VTurb (ex.: `guia-alzheimer-v1-a1` → `6a13a0b8fdf7a4c849eb57ba`).
- Página com 2 players (mobile+desktop) confirmada (`guia-alzheimer-d1-c`).
- API VTurb autentica e devolve métricas reais (`/players/list`, `/sessions/stats`).
- Confirmado: **conversão do VTurb = 0** (sem pixel de venda) → venda continua do Hotmart.

## Decisões travadas no brainstorming

1. **Unidade:** página ativa do Guia. Tela = tabela de páginas → clique → curva de retenção.
2. **Histórico:** snapshots **diários** (não só foto do período). Inclui a **curva** com histórico diário.
3. **Métricas de vídeo por página:** tempo médio assistido, % que chega no pitch, play rate, engajamento %.
4. **Mobile + desktop:** **somados** por página. Taxas recalculadas a partir das contagens somadas (não média de médias).
5. **Curva de retenção:** guardada **normalizada em % do vídeo (0→100%)** pra somar players de durações diferentes; pitch marcado em %. Tempo médio em mm:ss é KPI à parte.
6. **Vínculo página↔player:** **auto-scrape do embed + fallback manual** (abordagem A).
7. **Chave da página:** `landing_url` **normalizada** (scheme+host+path, sem query/UTM, sem barra final dupla).
8. **Venda por página (v1):** **pixel do Meta** (rotulado na tela). Hotmart segue como verdade dos KPIs do topo. Atribuição por UTM = trabalho futuro (ver seção própria).

## Princípios de atribuição (não dupla-contar)

- **Gasto** → Meta, por landing_url.
- **Venda/receita (KPIs do topo do Guia)** → Hotmart, por produto. **Inalterado.**
- **Venda por página (tabela)** → pixel do Meta por anúncio→landing_url. Serve pra **comparar páginas**; número absoluto pode não bater com Hotmart. **Rotulado explicitamente na UI.**
- **Métricas de vídeo** → VTurb. Conversão do VTurb é ignorada.

## API do VTurb (referência)

- **Base:** `https://analytics.vturb.net`
- **Auth:** headers `X-Api-Token: <token>` + `X-Api-Version: v1`. Token em `app.vturb.com/settings/analytics-api`. Server-side only.
- **Rate limit:** 60/min (Basic) … 800/min (Enterprise). Endpoint `/quota/usage` pra checar.
- **Endpoints usados:**
  - `GET /players/list` → id, name, `duration`, `pitch_time` (segundos; **0 = não configurado**), created_at.
  - `POST /sessions/stats_by_day` → por dia: total_viewed, total_started (plays), total_finished, total_clicked, total_over_pitch/under_pitch, engagement_rate, play_rate, over_pitch_rate. **Números vêm como string.**
  - `POST /times/user_engagement` → `average_watched_time` (s) + `grouped_timed: [{timed, total_users}]` (a curva, por intervalo).
- **Env:** `VTURB_API_TOKEN` (já em `.env.local`; adicionar na Vercel; documentar em `Secret KEYs/tokens.md`).

## Modelo de dados (`lib/schema/vturb.ts`)

Padrão Drizzle das tabelas existentes (bigserial id, date, jsonb, unique indexes). Exportar de `lib/schema/index.ts`.

1. **`vturb_players`** — cache de `/players/list`. Cols: `player_id` (text, unique, 24-hex), `name`, `duration_sec` (int), `pitch_time_sec` (int), `vturb_created_at` (ts), `updated_at`.
2. **`vturb_pages`** — uma linha por página. Cols: `id`, `product_slug` (text, default 'guia'), `page_url` (text, normalizada, unique por produto), `raw_example_url` (text), `is_active` (bool), `scrape_status` (text: `ok|no_embed|http_error`), `last_http_status` (int), `last_scraped_at` (ts), `updated_at`.
3. **`vturb_page_players`** — liga página↔player. Cols: `id`, `page_id` (fk), `player_id` (text), `source` (text: `auto|manual`). Unique `(page_id, player_id)`. Manual tem precedência sobre auto.
4. **`vturb_page_daily`** — snapshot diário por página (somado entre players). Cols: `id`, `page_id` (fk), `date`, `views`, `plays`, `finished`, `clicks`, `over_pitch`, `under_pitch` (ints), `avg_watched_sec` (numeric), `engagement_rate` (numeric %), `play_rate` (numeric %), `pitch_retention_rate` (numeric %, **null se pitch_time=0**), `raw` (jsonb: respostas cruas por player). Unique `(page_id, date)`.
5. **`vturb_retention_daily`** — curva por página por dia. Cols: `id`, `page_id` (fk), `date`, `duration_sec` (int), `pitch_pct` (numeric, null se pitch_time=0), `curve` (jsonb: `[{pct, users}]` somado entre players, normalizado 0–100%). Unique `(page_id, date)`.

Migration via `drizzle-kit generate` + `migrate` (**não `db:push`** em prod — materialized views não declaradas seriam dropadas).

## Sync (`lib/sync/syncVturb.ts` + `app/api/sync/vturb/route.ts`)

Cron Vercel **~08h UTC** (depois do Meta das 05h, pois lê URLs ativas das tabelas Meta). Rota espelha `/api/sync/refresh`: auth via `CRON_SECRET` bearer ou usuário logado, `maxDuration = 300`, `mode: daily|backfill|manual`.

`syncVturb({ mode, client })` em 4 passos:

1. **Catálogo:** `GET /players/list` → upsert `vturb_players`.
2. **Descobrir páginas ativas:** query nas tabelas Meta = landing_url normalizada de anúncios `ACTIVE` do Guia (reusa `productScopeWhere`). Upsert `vturb_pages`; marca `is_active`; páginas que saíram → `is_active=false` (mantém histórico).
3. **Resolver página→player (scrape):** pra cada página ativa:
   - se já tem mapa `manual` → respeita, não raspa.
   - senão `fetch` do HTML (redirect follow, UA de browser, timeout ~10s) → grava `last_http_status`.
     - extrai player_id(s) via `extractPlayerIds` → upsert `vturb_page_players` (source=auto, substitui auto anteriores).
     - 404/erro → `scrape_status=http_error`.
     - 200 sem embed → `scrape_status=no_embed`.
4. **Métricas:** pra cada página × player ligado, no range (daily = últimos 2 dias; backfill = N dias):
   - `/sessions/stats_by_day` (1 call/player cobre todos os dias).
   - `/times/user_engagement` por dia (curva + tempo médio).
   - soma contagens entre players, recalcula taxas, normaliza curva em %.
   - upsert `vturb_page_daily` + `vturb_retention_daily` (idempotente por `page_id+date`), grava `raw`.

**Robustez:**
- **Isolamento por página:** erro numa página não derruba o sync.
- **Rate limit:** daily ~30 calls (ok). Backfill: throttle + checa `/quota/usage`; backoff em 429.
- **Idempotente:** rodar de novo não duplica; janela de 2 dias no daily cobre dado atrasado.

## Queries (`lib/queries/vturb.ts`)

- `getActivePagesWithVideo(range)` → uma linha por página ativa, juntando por URL normalizada:
  - gasto + venda(pixel) do Meta (estende a lógica de `getPageFunnel` pra agrupar por URL **normalizada**),
  - tempo médio, play rate, engajamento, % pitch (agregado de `vturb_page_daily` no range),
  - saúde (`scrape_status`/`last_http_status`).
- `getPageRetention(pageId, range)` → curva agregada do período + `pitch_pct` + série diária de tempo médio/engajamento pro drill-down. **Agregação:** soma, por bucket de % do vídeo, o `users` dos dias do range; o gráfico plota **% de audiência = users(bucket) ÷ users(bucket 0)**. (Somar `users` e só depois normalizar evita distorção de dias com volumes diferentes — mesmo princípio do "não somar média de médias".)

## UI (`/guia`)

1. **Turbinar o card existente "Detalhamento por página de destino"** (`FunnelTablePage`): adiciona colunas de vídeo (Tempo médio · Play rate · Engaj. · %pitch) + badge de saúde (🟢/🔴/🟡). Respeita o toggle "Só ativos" que já existe. "Vendas" rotulada como pixel.
2. **Drill-down `/guia/pagina/[pageId]`** (espelha `/guia/criativo/[adId]`): **curva de retenção** (Recharts area, X=% vídeo, Y=% audiência, `ReferenceLine` no pitch) + evolução diária de tempo médio/engajamento + lista de anúncios/players que alimentam a página.
3. **Mapeamento manual** em `/settings/integrations`: painel listando páginas ativas 🟡 `no_embed`/`http_error`; pra cada, dropdown com players do `/players/list` (nomes tipo "Vsl guia V3 horizontal") → grava `vturb_page_players` (source=manual).

## Casos de borda

| Situação | Comportamento |
|---|---|
| `pitch_time = 0` | "% pitch" = "—" (e `pitch_retention_rate` null) |
| página sem player mapeado | 🟡 + fila de mapeamento manual |
| página 404 / erro HTTP | 🔴 alerta "anúncio ativo → página quebrada" |
| página com 0 plays no período | métricas de vídeo "—" (sem divisão por zero) |
| player raspado fora do catálogo | 🟡 + log |
| API VTurb não-200 / 429 | loga, pula player-dia, backoff; checa quota |

## Testes (vitest)

- `extractPlayerIds` — contra HTML real dos 3 casos (embed converteai, `vid-…`, sem-embed).
- Normalização de URL (tira query/UTM, barra final).
- Soma mobile+desktop + recálculo de taxas (fixtures).
- Normalização da curva em % de vídeo.
- Parser de resposta VTurb (string→número).
- `syncVturb` com `fetch` + cliente VTurb mockados (espelha `syncMeta.test.ts`). Zero chamada real.

## Trabalho futuro (fora deste spec)

- **Atribuição de vendas por UTM (Hotmart)** — capturar objeto `tracking`/UTM do webhook Hotmart (nova coluna jsonb em `purchases` + extração no parser), agrupar venda por `utm_source`/`utm_campaign`. Destrava venda-por-página mais precisa que o pixel **e** orgânico vs tráfego. Dependência: confirmar (via webhook cru) se `tracking` vem populado, e garantir que as páginas Lovable repassam UTM ao checkout. (Tarefa #8 da sessão.)
- **Retenção por origem de tráfego (UTM)** no VTurb (`/traffic_origin/stats`, `/times/user_engagement_by_traffic_origin`) — cruzar retenção por campanha.
- **A/B de VSL** (`/comparison_groups/*`).
- Estender a integração ao `/desafio`.

## Limpeza

Scripts de diagnóstico criados nesta investigação (úteis, seguem a convenção `diag-*`, não versionam segredo): `scripts/diag-guia-spend.ts`, `scripts/diag-vturb-poc.ts`, `scripts/diag-404-campaign.ts`. Manter ou remover a critério.
