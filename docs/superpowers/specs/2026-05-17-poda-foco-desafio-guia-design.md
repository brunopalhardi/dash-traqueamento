# Poda + Foco em Desafio e Guia — Design

**Data:** 2026-05-17
**Status:** rascunho — aguardando aprovação do Bruno

## Contexto e objetivo

Dashboard cresceu pra 5 produtos (Geral, C1, Desafio, Sono, Guia) + Instagram + tracking de UTMs. Bruno quer recolher escopo pra **só Desafio e Guia**, com Geral só como overview, e adicionar 3 painéis novos em cada produto:

1. **Métricas semanais** — visão da semana corrente do tráfego
2. **Top criativos vendendo** — ranking por revenue/purchases
3. **Lista de compradores da semana** — nome, telefone, e indicador "no grupo WhatsApp" (só /desafio)

Tudo que não serve esses dois produtos sai. UTMs virão via planilha (importador futuro, fora do escopo deste spec).

## O que sai

### Rotas de dashboard
- `app/(dashboard)/c1/`
- `app/(dashboard)/sono/`
- `app/(dashboard)/instagram/`
- `app/(dashboard)/_perpetuo-template.tsx` — **só depois** de reescrever `/guia/page.tsx` (hoje importa o template). /sono também importa, mas /sono já vai pro lixo junto.

### Instagram (stack inteira)
- `app/api/instagram/`
- `lib/instagram/`
- `lib/sync/syncInstagram.ts`
- `lib/queries/instagram.ts`
- `lib/schema/instagram.ts` + linha em `lib/schema/index.ts`
- Migration drizzle pra DROP nas tabelas `ig_*` (nova migration; **não editar** as antigas)
- Variável `IG_ACCESS_TOKEN` da Vercel (Bruno tira pela UI)

### Tracking de UTMs (parcial)
Bruno trará UTMs por planilha. A coleta via JS sai; a tabela `leads` fica pro importador futuro.

- `public/track.js`
- `app/api/track/`
- `components/dashboard/organic-panel.tsx`
- `lib/queries/organic.ts`
- **Mantém:** `lib/schema/leads.ts` e a tabela `leads` (importador da planilha vai popular ela)

### SendFlow webhook
- **Mantém integral** — é a fonte do "está no grupo?"

### `lib/products.ts`
- Remove `c1`, `sono`, `lancamento` do array
- `geral` continua mas com escopo reduzido (só agrega Desafio + Guia)

### Sidebar
- Sidebar fica: **Geral · Desafio · Guia · Configurações**

## O que fica e como fica

### Rotas
| Rota | Função |
|---|---|
| `/` (Geral) | Overview consolidado dos 2 produtos restantes (KPIs + top criativos top-level) |
| `/desafio` | Foco do projeto. Semanais + criativos + compradores + "no grupo" |
| `/guia` | Espelhado do /desafio **sem** coluna "no grupo" |
| `/settings` | Toggle de contas Meta (inalterado) |
| `/login` | Auth Supabase (inalterado) |

### Infraestrutura mantida (sem mudanças funcionais)
- Meta Ads sync (`lib/sync/syncMeta.ts`, `lib/meta/*`, `/api/sync/refresh*`)
- Cron diário 02h SP
- Reaper de jobs órfãos
- SendFlow webhook + schema `whatsapp_*`
- Auth Supabase
- Drizzle + migrations

## O que entra

### 1. Hotmart webhook

**Rota:** `app/api/webhooks/hotmart/route.ts`

**Eventos tratados:**
- `PURCHASE_APPROVED` — cria/atualiza row em `purchases` com status `approved`
- `PURCHASE_REFUNDED` — atualiza status pra `refunded`
- `PURCHASE_CHARGEBACK` — atualiza status pra `chargeback`

**Autenticação:** validação do header `X-Hotmart-Hottok` contra env `HOTTOK`.

**Resposta:** 200 sempre que processado (mesmo no replay); 401 se token inválido; 400 se payload malformado. Hotmart faz retry — idempotência é obrigatória (chave única no `transaction_id`).

**Persistência:** sempre persistir `raw_payload` antes de tentar parsear, pra não perder evento se o parser falhar (padrão já adotado no SendFlow — ver commit `4ea1b08`).

### 2. Nova tabela `purchases`

```sql
purchases (
  id                 bigserial primary key,
  transaction_id     text not null unique,        -- ID Hotmart, idempotência
  product_slug       text not null,                -- 'desafio' | 'guia' | outros
  product_name_raw   text,                          -- nome do produto no Hotmart, pra debug
  status             text not null,                -- 'approved' | 'refunded' | 'chargeback'
  buyer_name         text,
  buyer_email        text,
  buyer_phone_raw    text,
  buyer_phone_e164   text,                          -- normalizado via lib/utils/phone.ts
  value_cents        integer,
  currency           text,
  purchased_at       timestamptz not null,
  raw_payload        jsonb not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
)

index purchases_phone_idx        on (buyer_phone_e164)
index purchases_product_date_idx on (product_slug, purchased_at)
index purchases_status_idx       on (status)
```

**Mapeamento produto:** mesmo padrão do `detectProduct()` em `lib/products.ts` — regex no nome do produto Hotmart casa com `product_slug`. Caso não case com Desafio/Guia, gravamos como `outros` e ignoramos nos dashboards (não erro — só observabilidade).

### 3. Match comprador ↔ grupo WhatsApp

**Estratégia:** normalização E.164 BR via `lib/utils/phone.ts` em **ambos os lados** na hora de gravar:
- Hotmart webhook normaliza `buyer_phone_raw` → `buyer_phone_e164`
- SendFlow webhook já normaliza pra `phone_normalized` em `whatsapp_group_members`

**Query:** JOIN `purchases ON whatsapp_group_members(phone_normalized = buyer_phone_e164 AND currently_in_group = true)`. Resultado booleano por comprador.

**Edge case:** comprador sem telefone (Hotmart às vezes não traz) → `no_grupo = null` (mostra "—" na UI, não falso).

### 4. Painéis no /desafio

**Removo** Quality Donut, Hierarchy Table e Organic Panel — Bruno pediu foco. **Mantenho** o GroupPanel (estatísticas do grupo SendFlow) por enquanto, já que complementa a tabela de compradores.

**Novo layout do /desafio (top→bottom):**
1. `PageHeader` + `CycleSelector` (já existem)
2. **KPIs semanais** — Investimento · Leads · Vendas · Faturamento · CPL · CAC · ROAS (cards `kpi-card.tsx` existente)
3. **Funil de tráfego** — `funnel-chart.tsx` existente, da semana
4. **Top criativos** — `top-creatives.tsx` existente; rank por receita (Pixel)
5. **Compradores da semana** — tabela nova, componente `buyers-table.tsx`. Colunas: Data · Nome · Telefone (mascarado parcialmente) · Valor · **No grupo** (✅/❌/—). Telefones viram link `wa.me/<e164>`.
6. **Grupo WhatsApp** — `group-panel.tsx` existente, mantido como bloco final pra estatísticas do grupo do ciclo.

**"Semana" = janela do `CycleSelector`.** Bruno escolhe 7d/14d/15d/Custom (já existe). Default = 7d (seg→dom) calculado em `getCycleOverlay`.

### 5. Painéis no /guia

Espelha o /desafio, **menos** a coluna "No grupo" (Guia não tem grupo WhatsApp). Mesmos componentes, mesma estrutura.

### 6. Overview / (Geral)

Recolhe a página atual pra mostrar:
- KPIs consolidados dos 2 produtos (somatórios)
- Bloco "Por produto" com 2 cards (Desafio · Guia): investimento, vendas, faturamento, ROAS — clique navega pro respectivo dashboard

Remove qualquer referência a C1/Sono/Instagram/Organic.

## Componentes novos

- `components/dashboard/buyers-table.tsx` — tabela de compradores com indicador "no grupo"
- `lib/queries/purchases.ts` — `getBuyersForCycle(productSlug, from, to)` retornando linhas com `inGroup` resolvido via JOIN

## Componentes a deletar

- `components/dashboard/organic-panel.tsx`
- `components/dashboard/quality-donut.tsx`
- `components/dashboard/hierarchy-table.tsx`

(`group-panel.tsx` fica — usado no /desafio.)

## Limites e suposições

- **Hotmart webhook precisa ser cadastrado pelo Bruno** no painel da Hotmart apontando pra `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` com `HOTTOK` na Vercel. Sem isso, painel de compradores fica vazio.
- **Atribuição cria→venda** continua aproximada (via Pixel Meta) até a planilha de UTMs entrar. Top criativos = ranking por `purchase_value` do Pixel.
- **Tabela `leads`** preservada mas **não há mais coleta** até importador da planilha. Provavelmente vai precisar de migration pra adicionar colunas quando planilha existir — escopo separado.

## Ordem sugerida de execução

1. **Hotmart webhook + tabela `purchases`** primeiro — desbloqueia compradores no painel
2. **Poda** depois — deletar Instagram, C1, Sono, track.js, organic, painéis fora de escopo do /desafio
3. **Reescrever /guia** (com componentes novos, deixa de usar `_perpetuo-template`) e então deletar o template
4. **Repaginar /desafio e /** com painéis novos
5. **Buyers table com match no grupo** integrada em /desafio e /guia

Cada passo é uma PR autocontida.

## Fora de escopo (futuro)

- Importador da planilha de UTMs (vira spec separado quando o Bruno disponibilizar)
- Atribuição cria→venda por buyer (depende da planilha)
- Lead scoring com ML
- Google Ads / TikTok
- Multi-tenant
