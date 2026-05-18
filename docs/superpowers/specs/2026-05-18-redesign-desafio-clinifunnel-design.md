# Redesign /desafio — Design

**Data:** 2026-05-18
**Status:** aprovado pelo Bruno

## Contexto

Bruno acha o /desafio atual "muito tosco" comparado ao app CliniFunnel (4 prints anexados em conversa). Pediu redesign mantendo dados existentes mas com visualização moderna: KPIs com ícone+contexto, funil em barras horizontais, gráfico de barras (não linha), toggle de período anterior, drawer com detalhe do comprador, top criativos com thumbnail e mais info. Também quer versionamento visível e garantia de que ajustes anteriores estão deployados.

## Decisões fechadas no brainstorm

1. **6 KPIs no topo:** Investido · Compradores · Receita · CAC · ROAS · No grupo % (sem Leads, sem CPL — `Leads` requer planilha de UTMs futura; CPL não interessa).
2. **Comparação:** Toggle "vs período anterior" no header. Default OFF. Quando ON, KPIs mostram delta ±% e barras do gráfico ganham fantasma cinza atrás do período anterior.
3. **Detalhe do comprador:** Drawer lateral (slide-in da direita). URL não muda (sem rota dedicada).
4. **Gráfico diário:** Toggle entre 4 métricas (Vendas / Receita / Investido / ROAS) no canto do card. Barra por dia. Quando comparação ON, fantasma do anterior atrás.
5. **Top criativos:** Grid de 5 cards (igual hoje) com thumbnail maior, label de ROAS color-coded, mais info (impressões, CTR, gasto).
6. **Insight automático:** fora do escopo.
7. **Versionamento:** `package.json` versão semântica + commit hash auto via env var. Sidebar mostra `v0.6.0 · a3f4d2`.

## Arquitetura

```
app/(dashboard)/desafio/page.tsx           ← reescrita completa do layout
  └─ _hooks (server queries no Promise.all)
  └─ _components/
       ├─ kpi-grid.tsx                     ← NOVO 6 KpiCards modernos (ícone, valor, sublinha, delta opcional)
       ├─ conversion-funnel.tsx            ← NOVO barras horizontais (Impressões → Cliques → Compradores) com %
       ├─ daily-bar-chart.tsx              ← NOVO barras verticais com seletor de métrica + fantasma do período anterior
       ├─ top-creatives-grid.tsx           ← REESCRITO (substitui components/dashboard/top-creatives.tsx)
       ├─ buyers-table.tsx                 ← MOVIDO/REESCRITO (clica em linha → abre drawer)
       └─ buyer-drawer.tsx                 ← NOVO drawer lateral com timeline + produtos + no grupo

app/(dashboard)/guia/page.tsx              ← espelhado, sem coluna "no grupo" nem KPI "no grupo %"

components/dashboard/
  ├─ period-selector.tsx                   ← NOVO (substitui CycleSelector)
  ├─ comparison-toggle.tsx                 ← NOVO toggle "vs período anterior"
  ├─ kpi-card.tsx                          ← REFATORADO (suporta ícone + sublinha + delta)
  └─ sidebar.tsx                           ← MODIFICADO (versão + hash)

lib/queries/
  ├─ dashboard.ts                          ← novas funções (getDailySeries existe, expandir; getApprovedPurchaseCount/Revenue novas)
  └─ purchases.ts                          ← getBuyerJourney(buyerEmail|buyerPhone) NOVA pra drawer

lib/version.ts                             ← NOVO export VERSION + COMMIT_SHA (lê env)
```

## Componentes — detalhe

### 1. Header novo

- Título "Desafio" grande
- Sub-título com contexto do período ("01/05 — 18/05 · 18 dias")
- À direita: `<PeriodSelector />` + `<ComparisonToggle />`
- PeriodSelector: 7d, 15d, 30d, Este mês, Custom (Seg-Dom override pra Desafio)
- ComparisonToggle: chip "vs período anterior" com switch ON/OFF, default OFF

### 2. KPI Grid (6 cards)

Layout: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` (responsivo).

Cada `<KpiCard>` agora aceita:
```ts
interface KpiCardProps {
  label: string;              // "Investido"
  value: string;              // "R$ 1.234,56"
  hint?: string;              // "Meta R$ 5k"
  delta?: { pct: number; direction: "up" | "down" | "flat" } | null;
  icon: LucideIcon;
  invertDelta?: boolean;      // pra spend/CAC onde "menos é melhor"
  accent?: "violet" | "emerald" | "amber" | "rose" | "sky";
}
```

Os 6 cards do /desafio:
| Card | Valor | Hint | Delta source |
|---|---|---|---|
| Investido | `kpis.spend` (R$) | "CAC R$ X" | spend periodo anterior |
| Compradores | `purchaseCount` (Hotmart) | "vs Pixel X" | purchaseCount anterior |
| Receita | `revenueHotmart` (R$) | "TM R$ X" | revenue anterior |
| CAC | `spend / purchaseCount` (R$) | — | CAC anterior (invertDelta) |
| ROAS | `revenue / spend` (ratio) | "alvo 2x" | ROAS anterior |
| No grupo | `inGroupPct%` | "X de Y" | — |

`/guia`: os 6 cards menos "No grupo" → vira "Ticket médio" no lugar.

### 3. Funil de conversão (vertical, com barras horizontais)

Card abaixo dos KPIs. Mostra 3 stages: Impressões → Cliques → Compradores.
Estilo do print 1 ("Funil de conversao"):
- Stage Label à esquerda
- Valor + (% queda em relação ao anterior) à direita
- Barra horizontal preenchida proporcional ao valor da stage anterior
- Cor da barra: verde se conversion > 1% (compradores), azul/cinza pros outros

### 4. Gráfico diário (barras verticais)

Card grande, ao lado do funil (grid 1:1).
- Toggle no canto do card: `[Vendas] [Receita] [Investido] [ROAS]` (radio-style)
- Eixo X: dias do período
- Eixo Y: valor da métrica selecionada
- Quando comparação ON: barras-fantasma cinzas atrás (período anterior alinhado pelo dia-da-semana ou pelo offset do início)
- Header do card: total (à esquerda) · média diária · melhor dia (igual print 1)

Reaproveita Recharts já no projeto.

### 5. Top criativos (grid melhorado)

Substitui `top-creatives.tsx`. Grid de 5 cards (sm:grid-cols-2 lg:grid-cols-5).
Cada card:
- Thumbnail (h-32, aspect-square, object-cover, `creatives.thumbnailUrl`)
- Nome do ad (truncado em 1 linha, text-sm font-medium)
- Linha 1 (text-xs muted): Impressões · CTR
- Linha 2 (text-xs muted): Gasto · CPM
- Linha 3 (badge): "N vendas" + ROAS color-coded (verde >= 2, amber 1-2, rose < 1)
- Hover: leve shadow, cursor pointer (futuro: click pra drilldown — fora do escopo agora)

### 6. Tabela de compradores → drawer

`<BuyersTable buyers={...} showInGroup onSelect={(buyer) => setSelected(buyer)} />`
Cada linha click abre `<BuyerDrawer buyer={...} onClose={...} />` (state local do page).

### 7. Drawer do comprador

Slide-in da direita, largura ~480px. Conteúdo:
- Header: nome + telefone (mascarado) + "R$ X total" à direita
- 4 mini-cards: Primeiro contato (purchasedAt mais antigo) · Total de compras (N) · Última compra · Canal/UTM (vazio até planilha UTMs chegar)
- Card "Jornada": timeline simples
  - "Comprou Y" (data) — 1 linha por compra do mesmo telefone
  - "Entrou no grupo X" se evento joined existe em `whatsapp_group_events`
  - "Saiu do grupo X" se left
- Card "Produtos comprados": lista nome + data + status (badge approved/refunded/chargeback) + valor

Query nova: `getBuyerJourney(email?: string, phone?: string)` que retorna todas as compras do mesmo email/phone + eventos do WhatsApp casados pelo telefone.

### 8. Versionamento

- `package.json` mantém versão semântica. Bumpa manual em cada feature (regra: feature nova = minor, fix = patch).
- `lib/version.ts`:
  ```ts
  import pkg from "../package.json";
  export const VERSION = pkg.version;
  export const COMMIT_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
  ```
- `Sidebar` mostra `Traqueamento v{VERSION} · {COMMIT_SHA}` (substitui o `v0.3.0` hardcoded).
- Hoje bumpa pra **v0.6.0** (incorpora poda + Hotmart webhook + history sync).

## Dados / queries novas

- **`getApprovedPurchaseCount(slug, range)`** — `count(*) from purchases where productSlug = X and status = 'approved'`.
- **`getApprovedPurchaseRevenue(slug, range)`** — `sum(value_cents) / 100`.
- **`getInGroupStats(slug, range)`** — `{ buyersWithPhone, inGroupCount }` pra calcular % no grupo.
- **`getDailyPurchaseSeries(slug, range)`** — `[{ date, count, revenueCents }]` agregado por dia.
- **`getBuyerJourney({ email?, phone? })`** — `{ purchases: [...], whatsappEvents: [...] }`.

`getKpis` continua usado (impressões/cliques/spend do Meta) mas o número de compradores e receita virão de queries Hotmart (mais confiáveis).

## Espelhamento /guia

- Mesmo layout.
- Sem coluna "No grupo" na tabela de compradores.
- KPI "No grupo %" substituído por "Ticket médio".
- Drawer também sem timeline de grupo.

## Garantia de deploy do que já foi feito

- Branch `main` está com tudo mergeado (Hotmart webhook, poda, history sync, MAX_DAYS=365, COMPLETE handling).
- Vercel deploy automático a cada push em main — confirmado funcionando (`/api/sync/hotmart` responde 401 sem auth, indicando rota viva).
- Bruno precisa abrir hard refresh (Cmd+Shift+R) no navegador pra furar cache.
- Como esse redesign vai junto da v0.6.0, qualquer dúvida o badge versão+hash mostra exatamente o que tá no ar.

## Fora de escopo

- Importador da planilha de UTMs (próximo sub-projeto)
- Insight automático no rodapé
- Click no top criativo abre drilldown
- Métricas customizáveis no gráfico (mais que 4)
- Multi-tenant
- Página dedicada `/desafio/comprador/[id]` — drawer atende

## Ordem de execução (no plano)

1. **v0.6.0 + versão na sidebar** (cheap, primeiro pra Bruno ver mudança)
2. **Queries novas** (`getApprovedPurchaseCount`, `getApprovedPurchaseRevenue`, `getInGroupStats`, `getDailyPurchaseSeries`)
3. **KpiCard refatorado** (suporta ícone + delta + hint + accent)
4. **PeriodSelector + ComparisonToggle** (substitui CycleSelector)
5. **ConversionFunnel component**
6. **DailyBarChart component** (com toggle métrica + fantasma)
7. **TopCreativesGrid** (substitui top-creatives.tsx)
8. **getBuyerJourney + BuyerDrawer + integração na BuyersTable**
9. **Reescrita /desafio/page.tsx** com tudo acima
10. **Espelhar em /guia/page.tsx**
11. **Smoke test em produção**

Cada um vira commit separado.
