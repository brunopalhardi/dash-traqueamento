# Sub-projeto 2 — Integração Meta Ads API

**Data:** 2026-05-06
**Status:** Design aprovado, pronto pra plano de implementação
**Sub-projeto anterior:** [2026-05-04-infra-schema-design.md](./2026-05-04-infra-schema-design.md) — concluído

## Objetivo

Puxar dados de campanhas, anúncios, criativos e métricas diárias do Meta Ads para o Postgres, populando as tabelas criadas no sub-projeto 1. Entregar valor imediato pro time interno do "O Bom do Alzheimer" acompanhar performance.

## Decisões-chave

| Tema | Decisão | Motivo |
|---|---|---|
| Autenticação | **System User token** do Business Manager, em env var `META_SYSTEM_USER_TOKEN`, permissão **`ads_read`** apenas | Token não expira, padrão da Meta pra "servidor lendo dados", sem risco com Meta. Permissão mínima evita red flag. |
| Versão Graph API | **`v21.0`** fixa | Evita quebra silenciosa quando Meta atualizar versão default. |
| Métricas | Spend, impressões, cliques, CTR, CPC, CPM, leads (action `lead`), CPL calculado + dados de criativo (thumbnail, headline, body, tipo) | Cobertura essencial + análise de criativos. Sem breakdowns demográficos no MVP. |
| Backfill inicial | **Últimos 30 dias** | Time vai usar pra acompanhar mês corrente. Sync inicial rápido. |
| Sync incremental | **1x/dia** via cron existente (`/api/sync/refresh`, 02h SP) — pega `yesterday` | Já tá agendado, baixo custo de API. |
| Sync manual | Botão "Atualizar Agora" → endpoint `/api/sync/refresh-now` → pega `last_3d` | Re-sincroniza últimos 3 dias pra capturar correções tardias da Meta (atribuição). |
| Onde guardar config | Token em env var (Vercel), seleção de ad accounts via UI (flag `is_active` no banco) | Token nunca trafega via UI/log. Seleção de contas precisa ser configurável. |
| Worker | **Sem worker** — tudo inline em Vercel Functions | Decisão herdada do sub-projeto 1. Volume baixo cabe em function. |

## Arquitetura

```
┌─────────────────┐         ┌──────────────────┐
│  Meta Graph     │◄────────│  lib/meta/       │  cliente Graph API
│  API v21.0      │         │  - client.ts     │  (fetch + retry/backoff)
└─────────────────┘         │  - types.ts      │
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │  lib/sync/       │  orquestração
                            │  syncMeta.ts     │  (accounts→...→insights)
                            └────────┬─────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
      │ /api/sync/   │      │ /api/sync/   │      │ /settings/   │
      │ refresh      │      │ refresh-now  │      │ integrations │
      │ (cron 1x/dia)│      │ (botão)      │      │ (UI)         │
      └──────────────┘      └──────────────┘      └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  Supabase    │
                              │  Postgres    │
                              └──────────────┘
```

## Componentes

### 1. `lib/meta/client.ts` — cliente Graph API

**Responsabilidade:** falar com a Meta Graph API. Encapsula token, versão, retry, paginação, parsing de erro.

**Interface pública:**
- `metaClient.get<T>(path, params)` — GET genérico, paginação automática (segue `paging.next`)
- `metaClient.getMe()` — testa token, retorna `{ id, name }`
- `metaClient.getAdAccounts()` — lista contas do System User (`/me/adaccounts`)
- `metaClient.getCampaigns(accountId)` / `getAdsets(accountId)` / `getAds(accountId)` / `getCreatives(accountId)`
- `metaClient.getInsights(accountId, { datePreset | timeRange, level: 'ad', timeIncrement: 1 })`

**Tratamento de erro:**
- `429`, `500-599`, `code 17` (rate limit user), `code 80004` (rate limit ads) → backoff exponencial: 1s, 2s, 4s, 8s. Após 4 tentativas, lança `MetaRateLimitError`.
- `code 190` (token inválido), `code 200` (permissão negada) → falha imediata, lança `MetaAuthError`. Não retenta.
- Outros erros → lança `MetaApiError` com payload original.
- Respeita header `X-Business-Use-Case-Usage` quando presente (loga warning se uso > 75%).

**Token:** lido de `process.env.META_SYSTEM_USER_TOKEN`. Erro de boot se ausente.

### 2. `lib/sync/syncMeta.ts` — orquestração

**Função principal:** `syncMeta({ mode: 'backfill' | 'daily' | 'manual' })`

**Mapeamento de mode → date_preset:**
- `backfill` → `last_30d` (primeira vez por conta)
- `daily` → `yesterday`
- `manual` → `last_3d`

**Fluxo:**

1. Carrega `ad_accounts` onde `is_active = true`. Se nenhuma, retorna no-op.
2. Pra cada conta:
   1. Upsert hierarquia: campanhas → adsets → ads → creatives. Chave de upsert: `meta_id` (unique já existente).
   2. Pull insights nível `ad`, `time_increment=1`, com fields:
      `spend, impressions, clicks, ctr, cpc, cpm, actions, date_start`
   3. Filtra `actions[].action_type='lead'` → grava `leads` em `ad_insights_daily`.
   4. Calcula `cpl = spend / leads` (null se leads=0).
   5. Upsert em `ad_insights_daily` por `(ad_id, date)`.
3. Cada conta é independente (try/catch por conta — falha numa não para outras).
4. Registra resultado em `sync_jobs`:
   - `status`: `success` | `partial` | `failed`
   - `mode`, `started_at`, `finished_at`, `duration_ms`
   - `details` (jsonb): `{ accounts: [{ accountId, rowsByTable, error? }] }`

**Idempotência:** todos upserts usam `ON CONFLICT (meta_id) DO UPDATE` (ou `(ad_id, date)` em insights). Re-rodar mesmo dia sobrescreve, não duplica.

### 3. Endpoints

**`POST /api/sync/refresh` (existente — atualizar):**
- Mantém auth via `CRON_SECRET` Bearer.
- Hoje: só registra ping em `sync_jobs`. Atualizar pra chamar `syncMeta({ mode: 'daily' })`.
- Timeout: configurar `maxDuration: 300` (5min) na route.

**`POST /api/sync/refresh-now` (novo):**
- Auth via Supabase session (usuário logado).
- Body: `{ mode?: 'manual' | 'backfill' }` (default `manual`).
- Chama `syncMeta(...)` inline.
- Retorna resultado do sync_jobs criado.

**`GET /api/meta/accounts/discover` (novo):**
- Auth via Supabase session.
- Lista ad accounts do System User via `metaClient.getAdAccounts()`.
- Faz upsert em `ad_accounts` (insere as que ainda não existem com `is_active=false`).
- Retorna lista atual do banco.

**`POST /api/meta/accounts/toggle` (novo):**
- Body: `{ accountId: number, isActive: boolean }`.
- Atualiza flag `is_active`.

**`GET /api/meta/health` (novo):**
- Chama `metaClient.getMe()`. Retorna `{ ok: true, businessName }` ou `{ ok: false, error }`.

### 4. UI — `/settings/integrations`

Página protegida (middleware Supabase já cobre).

**Seções:**
1. **Status do token** — chama `/api/meta/health`. Verde se OK; vermelho com instruções se falhar.
2. **Contas de anúncio** — chama `/api/meta/accounts/discover` ao montar (atualiza lista). Mostra tabela com checkbox `is_active`. Ao mudar, chama `/api/meta/accounts/toggle`.
3. **Última sincronização** — última row de `sync_jobs`: status, timestamp, duração, contagem de linhas.
4. **Botão "Atualizar Agora"** — chama `/api/sync/refresh-now`. Mostra spinner enquanto roda. Atualiza painel do passo 3 ao terminar.
5. **Como gerar o token?** — accordion/modal com passo a passo (ver apêndice).

**Componentes shadcn:** `Card`, `Table`, `Switch`, `Button`, `Badge`, `Alert`, `Accordion`.

## Mudanças de banco

**Migration `0001_meta_integration.sql`:**

1. `ad_accounts.is_active boolean NOT NULL DEFAULT false` — nova coluna.
2. `ad_accounts.access_token_encrypted` → tornar **nullable** (token agora vem de env var; coluna fica disponível pra refator multi-tenant futuro sem perder a migration).
3. Nada novo em `creatives` — já tem `thumbnail_url`, `headline`, `body`, `type`, `call_to_action`.

Schema Drizzle (`lib/schema/meta.ts`) atualizado com os 2 ajustes acima.

## Variáveis de ambiente novas

```
META_SYSTEM_USER_TOKEN=EAAxxxxxxxxx        # System User access token (ads_read)
META_GRAPH_VERSION=v21.0                   # opcional, default v21.0
```

Adicionar ao `.env.example` e à Vercel (production + preview + development).

## Tratamento de erro / observabilidade

- Logs estruturados via `console.log(JSON.stringify({...}))` — Vercel já indexa.
- Token **nunca** logado. Sanitizar headers em qualquer log de request/response.
- Erros visíveis pro usuário na tela de Settings (último sync_job).
- Sem alertas externos no MVP.

## Testes

**Unitários (Vitest, rodam no CI):**
- `lib/meta/client.test.ts` — mock de `fetch`:
  - Sucesso simples
  - Paginação (segue `paging.next`)
  - 429 → backoff → sucesso
  - 429 persistente → `MetaRateLimitError` após 4 tentativas
  - Code 190 → `MetaAuthError` sem retry
- `lib/sync/syncMeta.test.ts` — mock do client:
  - Backfill popula 6 tabelas
  - Idempotência: rodar 2x não duplica
  - Falha em conta 1 não para conta 2
  - `sync_jobs` registra status correto

**Integração (manual, uma vez):**
- Gerar token, colar em `.env.local`, abrir `/settings/integrations`, validar fluxo end-to-end.

## Fora de escopo

- OAuth completo (multi-tenant) — fica pra refator com Rafa quando virar SaaS
- Worker dedicado em VPS — adiado conforme sub-projeto 1
- Breakdowns por idade/gênero/posicionamento/dispositivo — não no MVP
- Alertas externos (email/Slack) em falha de sync
- Google Ads, TikTok — fora do MVP
- Match lead → compra (Hotmart) — sub-projeto 3

---

## Apêndice — Passo a passo: gerar o System User token

> **Quando executar:** depois que o código estiver mergeado e a UI de Settings estiver no ar. Bruno faz isso uma vez.

### Pré-requisitos
- Conta Business Manager (BM) já existente do "O Bom do Alzheimer"
- Acesso de admin ao BM
- Ad accounts já vinculadas ao BM

### Passos

**1. Criar um Meta App (uma vez por projeto):**
   1. Ir em https://developers.facebook.com/apps/
   2. **Create App** → Use case: **Other** → Type: **Business** → Next
   3. Display name: `Dashboard Traqueamento` (ou qualquer nome interno)
   4. Business account: selecionar o BM "O Bom do Alzheimer"
   5. Create app → confirma senha
   6. Anota o **App ID** e **App Secret** (Settings → Basic) — não precisa colar no nosso projeto, é só pra registro

**2. Adicionar produto Marketing API:**
   1. No painel do app → **Add Product** → **Marketing API** → Set Up
   2. Não precisa configurar nada extra agora

**3. Criar o System User no Business Manager:**
   1. Ir em https://business.facebook.com/settings/system-users
   2. **Add** → Name: `dashboard-traqueamento-readonly` → Role: **Employee** (não Admin) → Create System User
   3. Confirma

**4. Atribuir ad accounts ao System User:**
   1. Selecionar o System User criado
   2. **Add Assets** → **Ad Accounts** → marcar as 3 contas → Permission: **View performance** (read-only) → Save
   3. **NÃO** marcar "Manage campaigns" — a gente só lê.

**5. Atribuir o app ao System User:**
   1. Mesma tela do System User → **Add Assets** → **Apps** → selecionar o app criado no passo 1 → Permission: **Develop app** → Save

**6. Gerar o token:**
   1. Ainda no System User → botão **Generate New Token**
   2. Selecionar o app criado no passo 1
   3. Token Expiration: **Never** (default pra System User)
   4. Permissions (marcar **só** essas):
      - ☑ `ads_read`
      - ☑ `business_management` (necessário pra listar ad accounts via `/me/adaccounts`)
      - **NÃO marcar:** `ads_management`, `pages_*`, qualquer outra coisa
   5. Generate Token
   6. **Copiar imediatamente** — Meta só mostra uma vez. Se perder, gera outro.

**7. Validar token (rapidinho, antes de colar na Vercel):**
   ```bash
   curl "https://graph.facebook.com/v21.0/me?access_token=COLA_TOKEN_AQUI"
   ```
   Esperado: `{"id":"...","name":"..."}`. Se vier erro, refazer passo 6.

**8. Colar na Vercel:**
   1. https://vercel.com/.../dash-traqueamento/settings/environment-variables
   2. Add: `META_SYSTEM_USER_TOKEN` = (token do passo 6)
   3. Environments: marcar **Production**, **Preview**, **Development**
   4. Save → redeploy automático

**9. Validar no dashboard:**
   1. Abrir https://dash-traqueamento.vercel.app/settings/integrations
   2. Status do token: deve estar **● Conectado**
   3. Lista de ad accounts deve aparecer
   4. Marcar uma conta → "Atualizar Agora" → ver "✓ sucesso" depois de 30-60s

### Renovação
- System User token **não expira**. Só precisa gerar de novo se:
  - For revogado manualmente no BM
  - O System User for deletado
  - O app for deletado/desativado
- Se isso acontecer, repetir passo 6 → 8 → 9.

### Segurança
- Token **só** vive em env var da Vercel + `.env.local` (gitignored).
- Nunca commitar, nunca colar em chat público, nunca logar.
- Permissões mínimas (`ads_read` + `business_management`) reduzem risco caso vaze.
