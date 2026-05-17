# Hotmart Sales History Sync — Design

**Data:** 2026-05-17
**Status:** aprovado pelo Bruno — pronto pra plano

## Contexto

Webhook do Hotmart já está em produção (`/api/webhooks/hotmart`) capturando vendas novas. Falta histórico — Bruno quer backfill dos últimos 30 dias e sync diário pra recuperar coisas que o webhook eventualmente perca (downtime, retries que estouraram, etc).

Hotmart expõe a **Sales History API** (`GET /payments/api/v1/sales/history`) com autenticação OAuth 2.0 client credentials. Diferente do webhook (que usa `hottok` fixo), a API precisa de Client ID + Client Secret pra gerar um Bearer token de curta duração.

Creds Hotmart já estão em `Secret KEYs/tokens.md`:
- Client ID: `6957e7c8-6e97-4c5b-ad8f-0079fb6bf296`
- Client Secret: `1e289a17-d197-4d1e-80be-e39f5bf777bf`
- Basic: `Basic Njk1...` (base64 de `<id>:<secret>`)

## Objetivo

1. Endpoint manual `POST /api/sync/hotmart?days=30` autenticado (CRON_SECRET) pra Bruno disparar backfill agora e on-demand.
2. Cron diário 03h SP puxando últimas 24h (+ 2h de overlap, idempotente via `transaction_id`).
3. UPSERT em `purchases` reusando o mesmo schema/idempotência do webhook.
4. Reuso máximo do parser existente — adapter fino entre formato sales-history e formato webhook.

## Arquitetura

```
lib/hotmart/
  parser.ts              ← existente (webhook)
  parser-history.ts      ← NOVO — converte item sales-history em envelope {event, data} e delega
  oauth.ts               ← NOVO — client_credentials → access_token, cache in-memory (TTL ~23h)
  client.ts              ← NOVO — fetchSalesHistory({ from, to }) paginado
  sync.ts                ← NOVO — orquestrador (oauth → fetch → parse → upsert)

app/api/sync/hotmart/route.ts  ← NOVO — POST (manual e cron), auth via CRON_SECRET
```

## Componentes

### `lib/hotmart/oauth.ts`

- Função `getAccessToken(): Promise<string>`.
- Faz `POST https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=...&client_secret=...` com header `Authorization: <HOTMART_BASIC>`.
- Resposta tem `access_token` (string) e `expires_in` (segundos, normalmente 86400 = 24h).
- Cache module-level: `{ token, expiresAt }`. Refaz quando `Date.now() > expiresAt - 60_000` (renova 1min antes do TTL pra evitar race com expiração no meio de uma chamada).
- Erros: lança `Error("hotmart oauth: <status> <body>")` — o caller decide se faz retry.

### `lib/hotmart/client.ts`

- Função `fetchSalesHistory({ startDate, endDate }): AsyncIterable<SalesItem>`.
- `startDate`/`endDate` são `Date` (convertidos pra epoch ms internamente — formato exigido pela Hotmart).
- Loop interno de paginação: chama `GET https://developers.hotmart.com/payments/api/v1/sales/history?start_date=<ms>&end_date=<ms>&max_results=100&page_token=<token>` até `page_info.next_page_token` ser null.
- Bearer token vem de `getAccessToken()`. Em 401 (token expirou cedo) tenta uma vez forçando refresh do token.
- Yield item-a-item (generator) pra não acumular tudo em memória.

### `lib/hotmart/parser-history.ts`

- Função pura `parseSalesHistoryItem(item: unknown): ParsedPurchase | null`.
- Lê `item.purchase.status` (uppercase) e mapeia pra evento:
  - `APPROVED` → `PURCHASE_APPROVED`
  - `REFUNDED` → `PURCHASE_REFUNDED`
  - `CHARGEBACK` → `PURCHASE_CHARGEBACK`
  - Qualquer outro (`STARTED`, `WAITING_PAYMENT`, `EXPIRED`, `CANCELED`, `COMPLETE`, `DELAYED`, `NO_FUNDS`, `OVERDUE`, `BLOCKED`, `PROTEST`, `BILLET_PRINTED`) → retorna `null` (ignorado).
- Monta envelope sintético `{ event, data: item }` e delega pra `parsePurchasePayload`. Zero duplicação de extração de buyer/product/price.

### `lib/hotmart/sync.ts`

- Função `syncSalesHistory({ days }): Promise<SyncStats>`.
- `days` default 1 (cron); manual passa explicitamente.
- Cria row em `syncJobs` com `type='hotmart_replay'`, `status='running'`. No final, atualiza com stats e marca `done` ou `failed`.
- Calcula `startDate = now - days*86400000 - 2*3600000` (overlap de 2h pra capturar coisas do webhook que ficaram em retentativa) e `endDate = now`.
- Itera `fetchSalesHistory`, conta:
  - `processed`: total iterado
  - `upserted`: itens que retornaram não-null do parser e foram persistidos
  - `skipped`: itens com status não suportado
- Retorna `{ processed, upserted, skipped, jobId, durationMs }`.
- Persistência: mesma lógica do webhook (`db.insert(purchases).values(...).onConflictDoUpdate(...)`), com `coalesce` nos buyer fields e overwrite do status/rawPayload/updatedAt.

### `app/api/sync/hotmart/route.ts`

- `POST` autenticado:
  - Header `Authorization: Bearer <CRON_SECRET>` (padrão dos outros sync endpoints) OU query `?cron_secret=<...>`.
  - Query `?days=N` (default 1). Limite máximo: 90 (proteção contra timeout).
  - Retorna 200 com stats ou 500 com erro.
- `GET` sem auth: status simples `{ ok: true, service: "hotmart-sync" }` pra debug.
- `export const dynamic = "force-dynamic"` + `export const maxDuration = 60` (segundos, limite do Vercel Pro).

### Cron Vercel

Editar `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/sync/refresh", "schedule": "0 5 * * *" },
    { "path": "/api/sync/hotmart", "schedule": "0 6 * * *" }
  ]
}
```

Cron Hotmart roda 06h UTC = 03h SP, 1h depois do Meta. Vercel Cron envia automaticamente o header `Authorization: Bearer <CRON_SECRET>` quando a env var `CRON_SECRET` existe no projeto — já está configurada (usada pelo `/api/sync/refresh`).

## Dados / persistência

Nenhuma migration necessária. Reuso de:
- `purchases` (tabela criada na poda anterior) — mesma idempotência via `transaction_id`
- `syncJobs.type = 'hotmart_replay'` — enum já existe
- `syncJobs.details` (jsonb) — guardamos `{ days, startDate, endDate, processed, upserted, skipped }`

## Env vars novas

Vercel (Production) + `.env.local`:
- `HOTMART_CLIENT_ID`
- `HOTMART_CLIENT_SECRET`

(`HOTMART_BASIC` é derivado: `"Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64")`. Computado em `lib/hotmart/oauth.ts`, não armazenado.)

## Testes (TDD)

- `lib/hotmart/oauth.test.ts` — mock global `fetch`:
  - Primeira chamada faz request, retorna token.
  - Segunda chamada retorna do cache (sem fetch).
  - Cache expira → faz request novo.
  - Erro 4xx/5xx → lança Error.
- `lib/hotmart/client.test.ts` — mock `fetch`:
  - 1 página, 0 itens → iterador vazio.
  - 2 páginas, 3+2 itens → 5 yields.
  - 401 → refresh + retry uma vez.
- `lib/hotmart/parser-history.test.ts`:
  - `APPROVED` → ParsedPurchase com status approved.
  - `REFUNDED` → status refunded.
  - `CHARGEBACK` → status chargeback.
  - `STARTED`/`WAITING_PAYMENT`/`EXPIRED`/`CANCELED` → null.
  - Item sem `purchase.status` → null.
  - Reuso real do `parsePurchasePayload` (não mockado) — verifica que extração de buyer/product funciona via item da sales-history.
- `app/api/sync/hotmart/route.test.ts`:
  - 401 sem CRON_SECRET.
  - 200 + stats com `fetch` mockado retornando 2 itens approved.
  - Idempotente: rodar 2x não duplica em `purchases`.

`sync.test.ts` não — coberto pela integração do route.test.

## Erros e limites

- **Timeout Vercel:** 60s no Pro. 90d × ~3000 itens estimados ≈ 30s no pior caso. Se Bruno escalar muito, mover pra Upstash queue (fora do escopo).
- **Rate limit Hotmart:** documentação informal sugere ~30 req/s. Não fazemos paralelismo (uma página de cada vez), folgado.
- **Token expirou no meio:** o client faz retry uma vez forçando refresh.
- **Item malformado:** parser retorna null → item ignorado (contado em `skipped`) sem abortar o sync inteiro.

## Fora de escopo

- UI no `/settings/integrations` com botão "Sincronizar Hotmart" — fácil de adicionar depois, mas o MVP é a API funcionar.
- Sincronização de produtos/coupons/refunds-detail.
- Métricas/observabilidade do oauth (token age, miss rate).
- Webhook de eventos não suportados (assinaturas, etc).

## Ordem de PRs

Uma PR única — 5 arquivos novos + 1 edit em `vercel.json`. Cada parte é commit separado por clareza:

1. `feat(hotmart): oauth client com cache`
2. `feat(hotmart): sales history API client (paginado)`
3. `feat(hotmart): parser-history adapter`
4. `feat(hotmart): sync orchestrator + endpoint /api/sync/hotmart`
5. `feat(cron): cron diário Hotmart 03h SP`
