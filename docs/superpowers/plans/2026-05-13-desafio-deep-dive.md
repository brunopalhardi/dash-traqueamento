# Plano — Desafio: aprofundar métricas, orgânico e WhatsApp

> **Status:** rascunho, aguardando aprovação do Bruno
> **Atualização:** 2026-05-13
> **Princípio:** uma fase de cada vez. Implementar → validar em produção com dados reais → debugar → próxima.
> Bugs encontrados em cada fase ficam registrados na seção "Bug tracking" no fim deste doc.

## Por que esse plano

O Desafio é o produto que mais precisa de profundidade analítica:
- ciclo semanal (ou 14/15 dias em campanhas estendidas)
- a maior parte da venda vem de **orgânico** (Reels, bio, grupos) — hoje não temos como medir
- a entrega acontece em **grupos de WhatsApp** via SendFlow — comprou mas não entrou no grupo é o vazamento mais caro do funil

Referência visual: VK Metrics, painel "Desafio 7D - O bom do Alzheimer" com Captação / Eventos / Outras etapas / Debriefing / Reports.

---

## Fases (do mais fácil pro mais difícil)

### 🟢 Fase 1 — Seletor de período flexível (1-2h)

**Problema:** hoje o dash Desafio assume sempre "semana corrente seg→dom" (7 dias). Quando a captação é de 14 ou 15 dias, o KPI de semana atual fica errado.

**O que entregar:**
- Novo seletor: `7d` / `14d` / `15d` / `30d` / `Custom (data início + data fim)`
- Manter o gráfico de "linhas sobrepostas por semana" — só que cada "semana" passa a ser a janela do ciclo escolhido
- KPIs reagem ao período selecionado
- Persistir período na URL (`?range=14&start=2026-05-01`)

**Arquivos afetados:**
- `components/dashboard/date-range-picker.tsx` (presets + input custom)
- `lib/queries/dashboard.ts` (`rangeCurrentWeek` → `rangeCurrentCycle(daysPerCycle)`)
- `app/(dashboard)/desafio/page.tsx`
- `lib/queries/dashboard.ts:getWeeklyOverlay` → `getCycleOverlay(cycleDays, cyclesBack)`

**Como saber que funcionou:** Bruno consegue ver "ciclo atual vs últimos 4 ciclos" com janelas de 7, 14 ou 15 dias sem mexer no código.

---

### 🟢 Fase 2 — Painéis do Desafio inspirados no VK (3-4h)

**Problema:** o dash atual tem KPI cards + gráfico overlay. Falta o detalhamento que o VK mostra.

**O que entregar (4 painéis novos):**

1. **TRÁFEGO (funil)** — CPM, CTR, Tx.Conv. (visitas → leads → vendas) em formato de funil visual
2. **QUALIDADE (donut + score)** — score 0-100 baseado em peso entre %vendas/leads, %ROAS > 1, %CPL < meta
3. **Tabela Campanhas / Conjuntos / Anúncios** — com colunas: Nome, Orçamento, Gasto, Vendas, CPA, ROAS, Lucro, Leads, CPL. Toggle entre 3 níveis (campanha/adset/ad), busca por nome, ordenação por coluna
4. **Principais criativos** — carrossel/grid com top 5 ads por gasto + thumbnail + nome + gasto

**Arquivos novos:**
- `components/dashboard/funnel-chart.tsx`
- `components/dashboard/quality-donut.tsx`
- `components/dashboard/campaigns-table.tsx` (com tabs Campanhas/Conjuntos/Anúncios)
- `lib/queries/dashboard.ts` (`getHierarchyTable(level, productSlug, range)`)

**Como saber que funcionou:** vejo no Desafio os 4 painéis renderizados com dados reais, números batem com Gerenciador.

---

### 🟡 Fase 3 — Tracking de orgânico via UTMs (4-6h, depende de mudanças nas LPs)

**Problema:** todo lead que vem de Reels, bio, grupos chega "Desconhecido" porque o Pixel não distingue origem.

**Como o VK faz:** mostra `organic_insta_reels`, `organic_grupos`, `organic_insta_bio`, `Desconhecido` no painel "Orgânico" → isso é o `utm_source` do link clicado.

**Estratégia (3 partes):**

**3a. Padronização de UTMs** — todo link orgânico postado pelo time precisa ter UTM. Convenção:
```
?utm_source=organic_insta_reels   (todos os reels)
?utm_source=organic_insta_bio     (link na bio)
?utm_source=organic_grupos        (grupos de WhatsApp/Telegram)
?utm_source=organic_email         (email marketing)
?utm_medium=organic               (sempre "organic" no orgânico)
?utm_campaign=desafio_2026_05     (ciclo do desafio)
?utm_content=reels_video_01       (identifica peça específica — opcional)
```
Bruno entrega a tabela final dessas convenções (já tem alguma planilha?).

**3b. Captura no checkout/LP**:
- Script JS leve injetado na LP da Hotmart (ou nossa LP própria) que:
  1. Lê os `utm_*` da URL no primeiro hit
  2. Salva em cookie de 30d
  3. No submit do form (lead) e na compra (Hotmart), envia pra nossa API
- Endpoint novo: `POST /api/track/lead` recebe `{ utms, fbclid, email, phone, gclid, landed_at }`

**3c. Persistência + dashboard**:
- Nova tabela `organic_leads` (ou estender `leads` existente com colunas UTM)
- Painel "Orgânico" no Desafio: barra horizontal "Leads por origem" + total + chart "Leads por dia (orgânico)"

**Decisões pendentes:**
- Bruno usa landing page própria ou checkout direto da Hotmart? (afeta onde injetar o script)
- Quer separar "lead orgânico" de "venda orgânica" ou só tracking de lead com cruzamento depois?

**Arquivos:**
- `public/track.js` (script público que vai na LP)
- `app/api/track/lead/route.ts`
- `lib/schema/tracking.ts` (nova tabela)
- `lib/queries/organic.ts` (queries de orgânico por produto/período)
- `components/dashboard/organic-panel.tsx`

---

### 🟡 Fase 4 — Integração SendFlow (2-3h)

**Problema:** queremos saber quem entrou no grupo de WhatsApp do Desafio (e cruzar com vendas).

**O que SendFlow oferece:**
- **Webhook outbound** (eles → nós): quando alguém entra/sai do grupo, dispara `POST <nossa URL>` com payload contendo telefone + grupo + timestamp
- **API REST** (nós → eles): `POST /imports`, `POST /campaigns/start` (não precisa pra esse caso de uso)

**O que entregar:**
- Endpoint `POST /api/webhooks/sendflow` que:
  1. Valida assinatura/token compartilhado (Bruno coloca em env var)
  2. Persiste o evento em `whatsapp_group_events` (tabela nova)
  3. Atualiza `whatsapp_group_members` (telefone único + grupo + último visto + status)
- Painel "Grupos WhatsApp" no Desafio: número de pessoas no grupo do ciclo atual, evolução diária, gráfico tipo funil "vendas → entraram no grupo"

**Pendências:**
- Bruno precisa criar o webhook no painel SendFlow apontando pra `https://dash-traqueamento.vercel.app/api/webhooks/sendflow?token=...`
- Token compartilhado pra autenticar (Bruno gera e cola na Vercel como `SENDFLOW_WEBHOOK_TOKEN`)
- Payload exato do SendFlow — pegar com o suporte deles ou interceptar um evento real

**Arquivos:**
- `lib/schema/whatsapp.ts`
- `app/api/webhooks/sendflow/route.ts`
- `lib/queries/whatsapp.ts`
- `components/dashboard/group-panel.tsx`

---

### 🟠 Fase 5 — Aba "Pendentes no grupo" (3-4h, depende da Fase 4 + Hotmart)

**Problema:** quem comprou mas não entrou no grupo do ciclo atual = vazamento direto de receita (a pessoa pode pedir reembolso por não receber a entrega).

**O que entregar:**
- Aba nova no Desafio: **"Pendentes no grupo"**
- Tabela de pessoas que:
  - Compraram dentro do ciclo atual (Hotmart) → match por email/telefone normalizado
  - **NÃO** aparecem na tabela `whatsapp_group_members` do grupo do ciclo
- Cada linha: nome, email, telefone, produto, data da compra, horas desde a compra
- Botão "Copiar telefone" + "Enviar lembrete via SendFlow" (futuro)

**Pré-requisitos:**
- Hotmart webhook implementado (Fase 5.0 — pode rolar em paralelo)
- Fase 4 entregue
- Normalização de telefone consistente entre Hotmart e SendFlow (ex.: `+5511999...` vs `(11) 99999...`)

**Arquivos:**
- `app/api/webhooks/hotmart/route.ts` (se ainda não existir)
- `lib/queries/group-pending.ts`
- `app/(dashboard)/desafio/_pending-tab.tsx`

---

### 🔴 Fase 6 — Reports do Desafio (futuro)

Painel "Debriefing" / "Reports" que o VK tem:
- Snapshot do ciclo completo após o fim do desafio
- Comparação com últimos 3 ciclos
- Export PDF/CSV pra apresentar pra equipe

Adiar até Fases 1-5 estarem estáveis.

---

## Ordem sugerida de execução

```
Fase 1 → valida → Fase 2 → valida → Fase 3 → valida → Fase 4 → valida → Fase 5 → valida → Fase 6
```

Cada validação é: Bruno olha em produção com dados reais, compara com Gerenciador / VK Metrics / planilha, me reporta o que diverge antes de eu seguir.

---

## Bug tracking

> Cada vez que algo diverge ou quebra, registramos aqui com data + sintoma + causa + fix.
> Fase atual no topo.

### Fase em andamento: _(nenhuma)_

### Histórico

_Vazio — começamos a registrar a partir da Fase 1._

---

## Notas técnicas — referência rápida

### SendFlow

- **Auth:** Bearer token no header `Authorization`
- **Webhook outbound:** SendFlow dispara `POST` na URL configurada quando há entrada/saída de grupo. Payload exato a confirmar com suporte.
- **Docs (último visto):** `https://app.sendflowai.com/docs/whatsapp/webhook-workflow` (404 quando tentei do meu lado — Bruno tem acesso pelo painel deles)
- **Blog com exemplos API:** https://blog.sendflow.pro/artigo/sendflow-api-exemplos-prontos-importar-lista-de-chats-em-csv/

### Hotmart

- **Webhook:** Bruno precisa cadastrar `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` no painel da Hotmart
- **HOTTOK:** secret pra assinar o webhook (cola em env `HOTMART_WEBHOOK_SECRET`)
- **Eventos relevantes:** `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`

### Convenção de UTMs (a confirmar com Bruno)

| utm_source | Onde | Exemplo de uso |
|---|---|---|
| `organic_insta_reels` | Reels do @obomalzheimer | Link arrastável no reel |
| `organic_insta_bio` | Link na bio | Linktree / link único |
| `organic_grupos` | Grupos próprios de WhatsApp | Link compartilhado em grupos |
| `organic_email` | Email marketing | Newsletter / sequência |
| `paid_meta_ads` | Meta Ads (já vem do Pixel) | Auto via fbclid |
