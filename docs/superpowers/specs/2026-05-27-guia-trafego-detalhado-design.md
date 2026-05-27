# Guia — Detalhamento de Tráfego (front, fase 2)

**Status:** Aprovado
**Data:** 2026-05-27
**Escopo:** Front das 4 tabelas de detalhamento na rota `/guia`. Backend (fase 1) já entregue (spec: `2026-05-27-meta-pixel-funnel-backend-design.md`).

---

## Contexto

Bruno mantém hoje no Looker Studio um painel com 4 tabelas: **Detalhamento Diário do Funil**, **por Campanha**, **por Criativo**, **por Página**. A fase 1 garantiu que os dados (LPV, Checkout, URL de destino) estão no banco. Agora trazemos a visualização pra dentro do dashboard próprio, com UI/UX superior ao Looker.

## Decisões de produto

- **Métricas vêm do Pixel** (não do match Hotmart) — bate com o que o Looker mostra. Compras = `conversions->>'purchase'`.
- **Ordenação default por spend desc** com top N (50 pro criativo/página, todos pro diário/campanha).
- **Sem sort/filter client-side na v1** — evita complexidade de estado. Se Bruno pedir, adiciono.
- **Responsividade**: tabelas dentro de wrapper `overflow-x-auto`. Em desktop, ocupam largura inteira. Em mobile, scroll horizontal — pattern existente no projeto.
- **Cores**: monocromático com destaques sutis — sem heatmap rainbow do Looker. Apenas:
  - CPA verde se `< spend/3` (alvo prático), amarelo se entre `spend/3` e `spend/2`, vermelho acima.
  - Taxas (Connect Rate, LPxCHKT, CHKTxCOMPRA): tabular-nums monocromático. Bold quando ≥ benchmark conhecido (ex.: CHKTxCOMPRA ≥ 20% bold).

## Arquitetura

### Tabelas

1. **Detalhamento Diário do Funil** — agrupa por `date` (todos ads do Guia).
   Colunas: Data · Impr · CPM · CTR · Cliques · CPC · Connect Rate · PageViews · Checkout · CPA CHKT · Compras · CPA · Gastos · LPxCHKT · CHKTxCOMPRA.
   Linha de total no rodapé.

2. **Detalhamento por Campanha** — agrupa por campanha (usa `campaign_insights_daily` MV).
   Colunas: Campanha · Impr · CPM · Freq · CTR · Cliques · CPC · Connect Rate · PageView · CHKT · CPA CHKT · Compras · CPA · LPxCHKT · CHKTxCOMPRA · Gastos.
   Linha de total.

3. **Detalhamento por Criativo** — Top 50 ads por spend.
   Colunas: Thumb · Anúncio · Link LP (clicável) · Impr · CTR · Cliques · CPC · Compras · CPA · Gastos · TxConv AD.
   Thumb e nome linkam pra `/guia/criativo/[adId]` (página existente). Link LP é externo (target=_blank).

4. **Detalhamento por Página** — agrupa por `landing_url`.
   Colunas: Página · Cliques · Connect Rate · PageView · LPxCHKT · Compras · CPA · Gastos · LPxCompras · CHKTxCompras.
   Ordenado por spend desc.

### Métricas derivadas (referência)

```
CTR             = clicks / impressions × 100
CPC             = spend / clicks
CPM             = spend / impressions × 1000
Connect Rate    = landing_page_view / clicks × 100
LPxCHKT         = initiate_checkout / landing_page_view × 100
CHKTxCOMPRA     = purchase / initiate_checkout × 100
LPxCompras      = purchase / landing_page_view × 100
CPA             = spend / purchase
CPA CHKT        = spend / initiate_checkout
TxConv AD       = purchase / clicks × 100
```

Todas as razões: se denominador = 0, mostra "—". `divSafe()` já existe em `lib/queries/dashboard.ts:101`.

### Arquivos

**Criados:**
- `lib/queries/funnel.ts` — 4 queries (`getDailyFunnel`, `getCampaignFunnel`, `getCreativeFunnel`, `getPageFunnel`). Cada uma retorna tipo dedicado.
- `components/dashboard/funnel-table-daily.tsx` — server component
- `components/dashboard/funnel-table-campaign.tsx` — server component
- `components/dashboard/funnel-table-creative.tsx` — server component (com next/link e next/image)
- `components/dashboard/funnel-table-page.tsx` — server component

**Modificados:**
- `app/(dashboard)/guia/page.tsx` — adiciona 4 cards após o "Compradores do período"
- `components/dashboard/format.ts` — +helpers `fmt.pct1` (1 casa) e `fmt.cpa(spend, count, target)` que devolve `{ value, severity }`

### Por que 4 componentes separados (não 1 genérico)?

As tabelas têm cabeçalhos, ordenação e células especiais (thumb, link clicável, URL truncada) muito diferentes. Um componente genérico com config-de-colunas dobraria a complexidade pra economizar ~30 linhas. YAGNI.

## Performance

- 4 queries em paralelo (já é padrão no `/guia` — `await Promise.all([...])`).
- `funnel-table-daily` faz query única em `ad_insights_daily` filtrada por produto.
- `funnel-table-campaign` usa `campaign_insights_daily` MV (rápido).
- `funnel-table-creative` faz `LIMIT 50` na query.
- `funnel-table-page` agrupa em `landing_url` direto na query (Postgres GROUP BY rápido pra ~poucas URLs distintas).

Cache: nenhum cache adicional. `force-dynamic` já está no `/guia` — refresh manual via period selector.

## Não-objetivos

- Sort/filter client-side
- Paginação (top 50 fixo)
- Export CSV (já temos botão similar no sendflow-panel; se Bruno pedir, replico)
- Replicar em `/desafio` (mesmo backend, mas spec separada quando for)
- Comparação cycle-to-cycle (`compare=1`) nestas tabelas — só nos KPIs

## Critérios de pronto

- [ ] `npm run test` passa (sem novos testes — UI é integração visual)
- [ ] `npm run build` passa
- [ ] `npm run lint` sem novos erros
- [ ] 4 tabelas renderizam em `/guia` com dados reais (após backfill em prod)
- [ ] Quando `landing_url` é NULL, tabela Páginas mostra "Sem URL" ou agrupa em "—"
- [ ] Quando não há dados (período sem ads), cada tabela mostra empty state ("Sem dados no período")
- [ ] Mobile: scroll horizontal funciona, não estoura layout

## Rollback

Revert do PR. Schema da fase 1 fica intacto.
