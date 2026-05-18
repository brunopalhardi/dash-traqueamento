# Página de Detalhe do Criativo — Design

**Data:** 2026-05-18
**Status:** rascunho — aguardando aprovação

## Contexto

Bruno mostrou print do CliniFunnel com "Análise de criativos" (print 14): lista ranqueada à esquerda, painel direito com preview do anúncio + métricas avançadas em barras horizontais (CTR, Hook Rate, Hold Rate, Body Rate, CPL, Score, Gasto), radar chart Body/Hook/Hold, botão "Ver anúncio". Quer o mesmo no Traqueamento.

Hoje o card de criativo abre Facebook Ad Library — que quebra quando o ad foi pausado/conta cancelada (caso real do Bruno).

## Decisões

1. **Página interna** `/desafio/criativo/[adId]` (não Ad Library externo). Click no card de Top Criativos abre essa rota.
2. **Layout** espelhando CliniFunnel: lista ranqueada à esquerda (40%), preview + métricas à direita (60%).
3. **Métricas mostradas**:
   - **Topo**: Gasto · Leads · Vendas · Receita · ROAS · CPL · CAC (em cards pequenos)
   - **Barras horizontais coloridas** (gradient): CTR, Hook Rate, Hold Rate, CPL, Score, Gasto, Body Rate
   - **Radar chart**: Body × Hook × Hold
4. **Convenção das métricas de vídeo** (padrão mercado):
   - `Hook Rate = video_3s_views / impressions`
   - `Hold Rate = video_p25_views / impressions`
   - `Body Rate = video_p50_views / impressions`
   - `Score = (Hook × 0.3) + (Hold × 0.4) + (Body × 0.3)` (média ponderada, escala 0-100)
5. **Botão "Ver anúncio"**: usa `ads.preview_shareable_link` (já existe no schema). Funciona pra ad ativo OU inativo (exige login Meta). Se não tiver, esconde botão.
6. **Sort dropdown**: CTR (default), ROAS, Gasto, Vendas, Hook Rate.

## Schema novo

Adicionar 3 colunas em `ad_insights_daily`:
- `video_p3s` (integer, nullable) — views de pelo menos 3 segundos
- `video_p25` (integer, nullable) — views 25%
- `video_p95` (integer, nullable) — views 95%

Migration nova. Já temos `video_views`, `video_p50`, `video_p75` — vão entrar `p3s`, `p25`, `p95`.

## Sync update

`lib/sync/syncMeta.ts` parser de insights — capturar de `video_play_actions[]` os items com `action_type === "video_view"` e `action_type === "video_3_sec_watched_actions"` etc. Meta retorna em formato `[{ action_type: "video_view", value: "1234" }, ...]`. Mapear:

| Meta action_type | DB column |
|---|---|
| `video_view` | `video_views` (já existe) |
| `video_3_sec_watched_actions` | `video_p3s` (novo) |
| `video_p25_watched_actions` | `video_p25` (novo) |
| `video_p50_watched_actions` | `video_p50` (existe) |
| `video_p75_watched_actions` | `video_p75` (existe) |
| `video_p95_watched_actions` | `video_p95` (novo) |

## Componentes

- `app/(dashboard)/desafio/criativo/[adId]/page.tsx` — server component, parseia adId, busca métricas, renderiza
- `app/(dashboard)/guia/criativo/[adId]/page.tsx` — espelha (mesma estrutura)
- `components/dashboard/creative-detail-panel.tsx` — painel direito (preview + barras + radar)
- `components/dashboard/creative-list.tsx` — lista esquerda (client component pra sort)
- `components/dashboard/metric-bar.tsx` — barra horizontal com gradient + valor
- `components/dashboard/creative-radar.tsx` — Recharts RadarChart com Body/Hook/Hold

## Queries

- `getAdDetail(adId: number, range: DateRange): Promise<AdDetail>` em `lib/queries/dashboard.ts`. Retorna:
  ```typescript
  interface AdDetail {
    adId: number;
    metaAdId: string;
    adName: string;
    campaignName: string;
    thumbnailUrl: string | null;
    previewShareableLink: string | null;
    spend, impressions, clicks, leads, purchases, revenue, ctr, cpl, cac, roas: number;
    videoViews, video3s, video25, video50, video75, video95: number;
    hookRate, holdRate, bodyRate, score: number;
  }
  ```
- `getCreativesRanking(slug: ProductSlug, range, sortBy): Promise<AdRow[]>` — lista todos pra mostrar na sidebar. Reusa `getTopAds` com `limit=100`.

## TopCreativesGrid

Mudança: ao clicar no card, abre `/desafio/criativo/[adId]` em vez de Ad Library externo. URL gerada com `adId` (interno do banco), não `metaAdId`.

## Fora de escopo

- Editar dados do criativo dali (read-only)
- Comparar criativos lado-a-lado
- Histórico temporal (gráfico por dia do criativo) — só agregado do período
- "Atualizar Tudo" como CliniFunnel — usa o Sincronizar do /settings

## Ordem de execução

1. Migration `ad_insights_daily` + 3 colunas video novas
2. Sync parser captura novos campos + Bruno aperta Sincronizar pra popular
3. Query `getAdDetail` + `getCreativesRanking`
4. Componentes (metric-bar, creative-radar, creative-detail-panel, creative-list)
5. Página `/desafio/criativo/[adId]` + espelhar `/guia/criativo/[adId]`
6. TopCreativesGrid: troca href Ad Library por rota interna
7. Bump v0.8.0
