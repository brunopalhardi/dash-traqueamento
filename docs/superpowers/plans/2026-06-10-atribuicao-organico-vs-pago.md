# Atribuição Orgânico vs Pago via UTM/SCK — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classificar cada venda Hotmart em **tráfego / orgânico / sem-atribuição** (decisão do Bruno: 3 baldes) e mostrar **ROAS por campanha com receita Hotmart real**, aproveitando o tracking que JÁ chega nos webhooks + formalizando a captura nas páginas.

**Architecture:** Descoberta da investigação (2026-06-10): os webhooks Hotmart **já trazem tracking estruturado** em `data.purchase.origin.sck` no formato `s=MetaAds_Instagram_Feed|m=...|c=NOME-CAMPANHA|co=NOME-AD|t=pago`, e `origin.xcod` traz `{vid: <ad_id>, vsrc: "paid_metaads", u: <uuid>}`. O histórico importado traz o equivalente em `purchase.tracking.source_sck`/`external_code`. Cobertura medida: 372 de 2.206 compras totais (17%) — dominado por compras antigas sem tracking; nas recentes a cobertura é majoritária. **Origem provável** (a confirmar na Task 7): parâmetros de URL configurados nos próprios anúncios Meta (`{{placement}}`, `{{campaign.name}}`, `{{ad.id}}`), repassados ao checkout. O plano: (Fase A) parser puro + colunas em `purchases` + backfill retroativo + split no dash + ROAS por campanha; (Fase B) formalizar a captura — template de URL params nos ads, snippet `t.js` servido pelo próprio dash pras LPs, e links decorados pros canais orgânicos.

**Tech Stack:** Next.js 16, Drizzle + Supabase Postgres, Vitest, Vercel.

---

## ⚠️ Regras do projeto (NÃO pular)

- **NUNCA `npm run db:push`** (dropa materialized views de prod). Migrations: `npm run db:generate` + `npm run db:migrate`.
- Scripts standalone rodam com `npx tsx --env-file=.env.local scripts/<x>.ts` — o `dotenv.config()` interno NÃO funciona (hoisting de imports ESM carrega `lib/db` antes).
- Branch nova antes do primeiro commit: `git checkout -b feat/atribuicao-organico-pago`. Nunca commitar na main.
- Testes (`npm test`) rodam contra o banco do `.env.local` (real). Testes novos deste plano são puros (sem DB) exceto onde indicado.
- A numeração de migration esperada é **0017** (a 0016 consolidada já existe). Se `db:generate` gerar outro número, ajustar os paths nos commits.
- LGPD: nenhum teste/log deve imprimir nome/email/telefone de comprador. Payloads de teste usam dados sintéticos.

## Formatos REAIS observados nos payloads (base pros testes)

```
# Webhook (data.purchase.origin):
sck:  "s=MetaAds_Instagram_Feed|m=01-GA-GRUPO-1-EXAUSTÃO-C|c=B-PERPETUO-GA-GRUPO-EXAUSTÃO-C|co=ADGA-VD-EXAUSTÃO-01_C|t=pago"
xcod: {"co":"ADGA-VD-EXAUSTÃO-01_C","vid":"120246037789890453","vsrc":"paid_metaads","u":"<uuid>"}

# Histórico (purchase.tracking):
source_sck:    mesmo formato do sck acima — MAS às vezes t= carrega um AD ID em vez de "pago":
               "s=...|m=...|c=...|co=...|t=120244742027820401"
external_code: string JSON: "{\"u\":\"<uuid>\",\"co\":\"...\",\"vid\":\"...\"}"

# Formatos NÃO-classificáveis que existem no banco (→ sem_atribuicao):
"utm_id=97760_v0_s00_e0_tv3"
"NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C"
(e a maioria das compras antigas: sem sck nenhum)
```

---

### Task 1: Parser puro de tracking (`lib/hotmart/tracking.ts`) — TDD

**Files:**
- Create: `lib/hotmart/tracking.ts`
- Create: `lib/hotmart/tracking.test.ts`

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `lib/hotmart/tracking.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractTracking, classifyTraffic, type PurchaseTracking } from "./tracking";

const SCK_PAGO =
  "s=MetaAds_Instagram_Feed|m=01-GA-GRUPO-1-EXAUSTÃO-C|c=B-PERPETUO-GA-GRUPO-EXAUSTÃO-C|co=ADGA-VD-EXAUSTÃO-01_C|t=pago";

describe("extractTracking — webhook (data.purchase.origin)", () => {
  it("extrai s/m/c/co/t do sck e vid do xcod", () => {
    const raw = {
      data: {
        purchase: {
          origin: {
            sck: SCK_PAGO,
            xcod: { co: "ADGA-VD-EXAUSTÃO-01_C", vid: "120246037789890453", vsrc: "paid_metaads", u: "abc" },
          },
        },
      },
    };
    const t = extractTracking(raw);
    expect(t.utmSource).toBe("MetaAds_Instagram_Feed");
    expect(t.utmMedium).toBe("01-GA-GRUPO-1-EXAUSTÃO-C");
    expect(t.utmCampaign).toBe("B-PERPETUO-GA-GRUPO-EXAUSTÃO-C");
    expect(t.utmContent).toBe("ADGA-VD-EXAUSTÃO-01_C");
    expect(t.adExternalId).toBe("120246037789890453");
    expect(t.trackingRaw).toBe(SCK_PAGO);
  });
  it("xcod como string JSON também funciona", () => {
    const raw = {
      data: { purchase: { origin: { sck: SCK_PAGO, xcod: '{"vid":"120246037789890453","vsrc":"paid_metaads"}' } } },
    };
    expect(extractTracking(raw).adExternalId).toBe("120246037789890453");
  });
});

describe("extractTracking — histórico (purchase.tracking)", () => {
  it("usa source_sck e external_code", () => {
    const raw = {
      purchase: {
        tracking: {
          source_sck: SCK_PAGO,
          external_code: '{"u":"x","vid":"120244742027820401"}',
        },
      },
    };
    const t = extractTracking(raw);
    expect(t.utmCampaign).toBe("B-PERPETUO-GA-GRUPO-EXAUSTÃO-C");
    expect(t.adExternalId).toBe("120244742027820401");
  });
  it("t= com AD ID (formato antigo) vira adExternalId fallback", () => {
    const raw = {
      purchase: { tracking: { source_sck: "s=MetaAds_Feed|c=CAMP-X|t=120244742027820401" } },
    };
    const t = extractTracking(raw);
    expect(t.adExternalId).toBe("120244742027820401");
  });
});

describe("extractTracking — payloads sem tracking", () => {
  it("payload sem nada retorna campos null", () => {
    const t = extractTracking({ data: { purchase: {} } });
    expect(t.utmSource).toBeNull();
    expect(t.trackingRaw).toBeNull();
  });
  it("formatos não-pipe são preservados em trackingRaw mas não parseiam UTM", () => {
    const raw = { purchase: { tracking: { source_sck: "NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C" } } };
    const t = extractTracking(raw);
    expect(t.trackingRaw).toBe("NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C");
    expect(t.utmSource).toBeNull();
  });
});

describe("classifyTraffic — 3 baldes", () => {
  const base: PurchaseTracking = {
    utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
    adExternalId: null, trackingRaw: null, trackingType: null, vsrc: null,
  };
  it("t=pago → trafego", () => {
    expect(classifyTraffic({ ...base, trackingType: "pago" })).toBe("trafego");
  });
  it("vsrc paid_* → trafego", () => {
    expect(classifyTraffic({ ...base, vsrc: "paid_metaads" })).toBe("trafego");
  });
  it("t= com ad id → trafego (veio de anúncio)", () => {
    expect(classifyTraffic({ ...base, trackingType: "120244742027820401" })).toBe("trafego");
  });
  it("s= contendo MetaAds → trafego", () => {
    expect(classifyTraffic({ ...base, utmSource: "MetaAds_Instagram_Feed" })).toBe("trafego");
  });
  it("organico explícito → organico (em t= ou s=)", () => {
    expect(classifyTraffic({ ...base, trackingType: "organico" })).toBe("organico");
    expect(classifyTraffic({ ...base, utmSource: "Organico_Bio" })).toBe("organico");
    expect(classifyTraffic({ ...base, utmSource: "organic" })).toBe("organico");
  });
  it("organico GANHA de s= pago quando t=organico (t é a intenção explícita)", () => {
    expect(classifyTraffic({ ...base, utmSource: "MetaAds_Feed", trackingType: "organico" })).toBe("organico");
  });
  it("sem nada → sem_atribuicao", () => {
    expect(classifyTraffic(base)).toBe("sem_atribuicao");
  });
  it("tracking não-classificável → sem_atribuicao", () => {
    expect(classifyTraffic({ ...base, trackingRaw: "NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C" })).toBe("sem_atribuicao");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- lib/hotmart/tracking.test.ts`
Expected: FAIL — módulo `./tracking` não existe.

- [ ] **Step 3: Implementar `lib/hotmart/tracking.ts`**

```ts
/**
 * Extração e classificação do tracking de origem das vendas Hotmart.
 *
 * O sck chega no formato pipe "s=<source>|m=<medium>|c=<campaign>|co=<content>|t=<tipo>"
 * (montado pelos parâmetros de URL dos anúncios Meta e repassado ao checkout).
 * O t= é "pago" nas campanhas atuais, mas em formatos antigos carrega o AD ID.
 * O xcod/external_code traz {vid: <ad_id>, vsrc: "paid_metaads", u: <session>}.
 *
 * Classificação em 3 baldes (decisão Bruno 2026-06-10):
 *   trafego        — evidência de anúncio pago (t=pago, vsrc=paid_*, ad id, s=*Ads*)
 *   organico       — declarado explicitamente (t=organico, s contendo organic/organico)
 *   sem_atribuicao — sem tracking ou tracking não-classificável (visível no dash;
 *                    NUNCA atribuir ao tráfego por padrão — inflaria o CAC)
 */

export type TrafficBucket = "trafego" | "organico" | "sem_atribuicao";

export interface PurchaseTracking {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  /** ad id do Meta (xcod.vid, external_code.vid, ou t= numérico) */
  adExternalId: string | null;
  /** sck/source_sck cru, pra auditoria e reclassificação futura */
  trackingRaw: string | null;
  /** valor do t= (pago | organico | <ad_id> | null) */
  trackingType: string | null;
  /** xcod.vsrc (ex.: paid_metaads) */
  vsrc: string | null;
}

const EMPTY: PurchaseTracking = {
  utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
  adExternalId: null, trackingRaw: null, trackingType: null, vsrc: null,
};

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Parseia "k=v|k=v" tolerante; retorna null se não for formato pipe. */
function parseSck(sck: string): Map<string, string> | null {
  if (!sck.includes("=") || !sck.includes("|")) return null;
  const map = new Map<string, string>();
  for (const part of sck.split("|")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k && v) map.set(k, v);
  }
  return map.size > 0 ? map : null;
}

/** xcod pode vir como objeto ou string JSON. */
function parseXcod(v: unknown): { vid?: string; vsrc?: string } {
  let obj = asObj(v);
  if (!obj && typeof v === "string") {
    try {
      obj = asObj(JSON.parse(v));
    } catch {
      return {};
    }
  }
  if (!obj) return {};
  return {
    vid: typeof obj.vid === "string" ? obj.vid : undefined,
    vsrc: typeof obj.vsrc === "string" ? obj.vsrc : undefined,
  };
}

const AD_ID_RE = /^\d{10,}$/;

/** Extrai tracking de um raw_payload (webhook OU item do histórico). */
export function extractTracking(raw: unknown): PurchaseTracking {
  const root = asObj(raw);
  if (!root) return { ...EMPTY };

  // webhook: data.purchase.origin.{sck,xcod} · histórico: purchase.tracking.{source_sck,external_code}
  const origin = asObj(asObj(asObj(root.data)?.purchase)?.origin);
  const tracking = asObj(asObj(root.purchase)?.tracking);

  const sckStr =
    (typeof origin?.sck === "string" && origin.sck) ||
    (typeof tracking?.source_sck === "string" && tracking.source_sck) ||
    null;
  const xcod = parseXcod(origin?.xcod ?? tracking?.external_code);

  const out: PurchaseTracking = { ...EMPTY, trackingRaw: sckStr, vsrc: xcod.vsrc ?? null };

  if (sckStr) {
    const kv = parseSck(sckStr);
    if (kv) {
      out.utmSource = kv.get("s") ?? null;
      out.utmMedium = kv.get("m") ?? null;
      out.utmCampaign = kv.get("c") ?? null;
      out.utmContent = kv.get("co") ?? null;
      out.trackingType = kv.get("t") ?? null;
    }
  }
  // vid do xcod ganha; t= numérico (formato antigo) é fallback
  out.adExternalId =
    xcod.vid ?? (out.trackingType && AD_ID_RE.test(out.trackingType) ? out.trackingType : null);
  return out;
}

/** Classifica nos 3 baldes. Orgânico explícito ganha; depois evidência de pago; resto sem_atribuicao. */
export function classifyTraffic(t: PurchaseTracking): TrafficBucket {
  const ty = t.trackingType?.toLowerCase() ?? "";
  const src = t.utmSource?.toLowerCase() ?? "";

  if (ty === "organico" || ty === "organic") return "organico";
  if (src.includes("organic")) return "organico"; // cobre "organico" e "organic"

  if (ty === "pago") return "trafego";
  if (ty && AD_ID_RE.test(ty)) return "trafego"; // formato antigo: t=<ad_id>
  if (t.vsrc?.toLowerCase().startsWith("paid")) return "trafego";
  if (t.adExternalId) return "trafego";
  if (src.includes("ads")) return "trafego"; // MetaAds_*, GoogleAds_*

  return "sem_atribuicao";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/hotmart/tracking.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/hotmart/tracking.ts lib/hotmart/tracking.test.ts
git commit -m "feat: parser puro de tracking sck/xcod das vendas Hotmart + classificacao em 3 baldes"
```

---

### Task 2: Migration — colunas de tracking em `purchases`

**Files:**
- Modify: `lib/schema/purchases.ts`
- Create: migration via `npm run db:generate` (esperada: `drizzle/0017_*.sql`)

- [ ] **Step 1: Adicionar colunas no schema**

Em `lib/schema/purchases.ts`, depois de `rawPayload`:

```ts
    /** Classificação da origem: trafego | organico | sem_atribuicao (lib/hotmart/tracking.ts) */
    trafficSource: text("traffic_source"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    /** ad id do Meta vindo do xcod.vid (liga venda → anúncio → campanha) */
    adExternalId: text("ad_external_id"),
    /** sck cru pra auditoria/reclassificação */
    trackingRaw: text("tracking_raw"),
```

E nos índices da tabela, adicionar:

```ts
    index("purchases_traffic_source_idx").on(t.productSlug, t.trafficSource),
    index("purchases_utm_campaign_idx").on(t.utmCampaign),
```

- [ ] **Step 2: Gerar e conferir a migration**

Run: `npm run db:generate -- --name purchases_tracking`
Expected: `drizzle/0017_purchases_tracking.sql` contendo SÓ `ALTER TABLE "purchases" ADD COLUMN ...` (7 colunas) + 2 `CREATE INDEX`. Se aparecer QUALQUER outra coisa (drop, view), PARAR e investigar.

- [ ] **Step 3: Aplicar**

Run: `npm run db:migrate`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add lib/schema/purchases.ts drizzle/
git commit -m "feat: colunas de tracking/atribuicao em purchases (traffic_source, utm_*, ad_external_id)"
```

---

### Task 3: Webhook + sync de histórico populam os campos

**Files:**
- Modify: `lib/hotmart/parser.ts` (interface `ParsedPurchase` + `parsePurchasePayload`)
- Modify: `lib/hotmart/parser-history.ts` (`parseSalesHistoryItem`)
- Modify: `app/api/webhooks/hotmart/route.ts` (insert ~linha 89)
- Modify: `lib/hotmart/sync.ts` (inserts ~linhas 68 e 107)

- [ ] **Step 1: Estender `ParsedPurchase`**

Em `lib/hotmart/parser.ts`, na interface `ParsedPurchase` (linha ~4), adicionar:

```ts
  trafficSource: "trafego" | "organico" | "sem_atribuicao";
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  adExternalId: string | null;
  trackingRaw: string | null;
```

- [ ] **Step 2: Popular nos dois parsers**

Em `parsePurchasePayload` (parser.ts) e `parseSalesHistoryItem` (parser-history.ts), antes do `return`, adicionar (import no topo: `import { extractTracking, classifyTraffic } from "./tracking";`):

```ts
  const tracking = extractTracking(raw);
  const trafficSource = classifyTraffic(tracking);
```

e incluir no objeto retornado:

```ts
    trafficSource,
    utmSource: tracking.utmSource,
    utmMedium: tracking.utmMedium,
    utmCampaign: tracking.utmCampaign,
    utmContent: tracking.utmContent,
    adExternalId: tracking.adExternalId,
    trackingRaw: tracking.trackingRaw,
```

ATENÇÃO em `parser-history.ts`: o parâmetro pode se chamar `item` em vez de `raw` — passar o objeto CRU completo do item (que contém `purchase.tracking`), não um sub-campo. Ler a função antes.

- [ ] **Step 3: Incluir nos inserts**

Nos 3 pontos de insert (`app/api/webhooks/hotmart/route.ts:~89`, `lib/hotmart/sync.ts:~68` e `~107`): adicionar os 7 campos novos no `.values({...})` E no `set` do `.onConflictDoUpdate` (se houver), mapeando 1:1 do `ParsedPurchase`. Ler cada call site e seguir o padrão dos campos existentes (ex.: `buyerPhoneE164`).

- [ ] **Step 4: Atualizar testes existentes dos parsers**

Run: `npm test -- lib/hotmart`
Os testes de `parser.test.ts`/`parser-history.test.ts` podem falhar por campos novos obrigatórios no tipo. Corrigir as fixtures incluindo os campos (ou assertando os valores novos — payload de teste sem tracking deve resultar `trafficSource: "sem_atribuicao"`).
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add lib/hotmart/parser.ts lib/hotmart/parser-history.ts app/api/webhooks/hotmart/route.ts lib/hotmart/sync.ts
git commit -m "feat: webhook e sync de historico gravam atribuicao da venda (traffic_source + utm_*)"
```

---

### Task 4: Backfill retroativo das 2.206 compras

**Files:**
- Create: `scripts/backfill-tracking.ts`

- [ ] **Step 1: Criar o script**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { extractTracking, classifyTraffic } from "@/lib/hotmart/tracking";
import { eq } from "drizzle-orm";

(async () => {
  const rows = await db
    .select({ id: purchases.id, raw: purchases.rawPayload })
    .from(purchases);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const t = extractTracking(r.raw);
    const bucket = classifyTraffic(t);
    await db
      .update(purchases)
      .set({
        trafficSource: bucket,
        utmSource: t.utmSource,
        utmMedium: t.utmMedium,
        utmCampaign: t.utmCampaign,
        utmContent: t.utmContent,
        adExternalId: t.adExternalId,
        trackingRaw: t.trackingRaw,
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, r.id));
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  console.log("backfill ok:", counts);
  process.exit(0);
})();
```

- [ ] **Step 2: Rodar e validar os números**

Run: `npx tsx --env-file=.env.local scripts/backfill-tracking.ts`
Expected: `backfill ok: { trafego: ~370+, sem_atribuicao: ~1800, organico: ? }`. Sanidade: trafego deve ser ≥ 285 (os t=pago já medidos) + os com ad id. Se organico = 0, é esperado (nenhum link orgânico decorado existe ainda — Fase B resolve). Reportar os números ao Bruno.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-tracking.ts
git commit -m "feat: backfill retroativo de atribuicao a partir do raw_payload"
```

---

### Task 5: Split de receita no dashboard

**Files:**
- Modify: `lib/queries/purchases.ts`
- Modify: `app/(dashboard)/page.tsx` (Geral)
- Modify: `app/(dashboard)/guia/page.tsx` e `app/(dashboard)/desafio/page.tsx`

- [ ] **Step 1: Query de split**

Em `lib/queries/purchases.ts`, adicionar (segue o padrão das funções existentes, usando o helper `inRangeBR` já presente no arquivo):

```ts
export interface RevenueSplit {
  trafego: number;
  organico: number;
  semAtribuicao: number;
}

/** Receita aprovada (R$) por balde de atribuição no período (fuso BR). */
export async function getRevenueSplit(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<RevenueSplit> {
  const rows = await db
    .select({
      bucket: purchases.trafficSource,
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    )
    .groupBy(purchases.trafficSource);

  const out: RevenueSplit = { trafego: 0, organico: 0, semAtribuicao: 0 };
  for (const r of rows) {
    const reais = Number(r.cents) / 100;
    if (r.bucket === "trafego") out.trafego += reais;
    else if (r.bucket === "organico") out.organico += reais;
    else out.semAtribuicao += reais; // null (pré-backfill) cai aqui
  }
  return out;
}
```

- [ ] **Step 2: UI na Visão Geral**

Em `app/(dashboard)/page.tsx`: importar `getRevenueSplit`; buscar o split somado dos `salesProducts` no mesmo `Promise.all` da receita Hotmart (somar os baldes dos produtos). O card "Receita (Hotmart)" ganha hint com o split, e o ROAS passa a ter o ROAS-tráfego como número principal:

```tsx
        <KpiCard
          label="Receita (Hotmart)"
          value={fmt.money(revenueHot)}
          delta={deltaFromKpis(revenueHot, prevRevenueHot)}
          hint={`tráfego ${fmt.money(split.trafego)} · orgânico ${fmt.money(split.organico)} · s/atrib. ${fmt.money(split.semAtribuicao)}`}
        />
        <KpiCard
          label="ROAS (tráfego)"
          value={fmt.ratio(kpis.spend > 0 ? split.trafego / kpis.spend : 0)}
          hint={`só receita atribuída a anúncios ÷ gasto Meta · ROAS total: ${fmt.ratio(roasReal)}`}
          tone={/* mesmos thresholds 2/1/0 do card atual, aplicados ao roas de tráfego */}
        />
```

(Adaptar: `split` = soma dos baldes de todos os salesProducts; manter delta do ROAS usando o split do prevRange. Seguir o padrão já existente de `hotCurr`/`hotPrev`.)

- [ ] **Step 3: UI no Guia e Desafio**

Nas duas páginas de produto: buscar `getRevenueSplit(slug, currentRange)` junto das queries existentes e exibir o split como hint no card de receita existente (mesmo formato do Step 2). NÃO mudar o layout — só hint. Ler como o card de receita atual é montado em cada página e seguir o padrão.

- [ ] **Step 4: Verificar + commit**

Run: `npx tsc --noEmit && npm test && npm run build`

```bash
git add lib/queries/purchases.ts "app/(dashboard)/page.tsx" "app/(dashboard)/guia/page.tsx" "app/(dashboard)/desafio/page.tsx"
git commit -m "feat: split de receita trafego/organico/sem-atribuicao nos dashes + ROAS de trafego"
```

---

### Task 6: ROAS por campanha com receita Hotmart real

O `c=` do sck carrega o NOME da campanha Meta → match por nome com a tabela `campaigns`.

**Files:**
- Modify: `lib/queries/purchases.ts` (query nova)
- Modify: `components/dashboard/funnel-table-campaign.tsx` + a página que a alimenta (ler `lib/queries/funnel.ts` pra achar a query de campanhas do funil)

- [ ] **Step 1: Query receita por campanha**

Em `lib/queries/purchases.ts`:

```ts
/** Receita Hotmart aprovada por NOME de campanha (match do c= do sck), upper-cased. */
export async function getRevenueByCampaignName(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      campaign: sql<string>`upper(${purchases.utmCampaign})`,
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        eq(purchases.trafficSource, "trafego"),
        sql`${purchases.utmCampaign} is not null`,
        inRangeBR(range),
      ),
    )
    .groupBy(sql`upper(${purchases.utmCampaign})`);
  return new Map(rows.map((r) => [r.campaign, Number(r.cents) / 100]));
}
```

- [ ] **Step 2: Plugar na tabela de campanhas do funil**

Ler `lib/queries/funnel.ts` (query que alimenta `funnel-table-campaign.tsx`) e a página que renderiza. Na página (server component), buscar `getRevenueByCampaignName(slug, range)` e fazer o match em memória: `revenueMap.get(row.name.toUpperCase()) ?? 0`. Passar pra tabela duas colunas novas: **"Receita Hot"** (`fmt.money`) e **"ROAS real"** (`receita / spend` da linha, `fmt.ratio`). Seguir exatamente o padrão visual das colunas existentes da tabela (ler o componente antes; header + célula + formatação).

Match é best-effort por nome: campanhas renomeadas no Meta depois da venda não casam — a receita delas não soma na linha (continua no total do produto). Aceitável; documentar no code comment.

- [ ] **Step 3: Verificar visualmente + commit**

Run: `npm run dev` → abrir `/guia`, conferir colunas novas com valores plausíveis (campanha EXAUSTÃO deve ter receita > 0). Parar o server.

```bash
git add lib/queries/purchases.ts components/dashboard/funnel-table-campaign.tsx "app/(dashboard)/guia/page.tsx" "app/(dashboard)/desafio/page.tsx"
git commit -m "feat: ROAS por campanha com receita Hotmart real (match via c= do sck)"
```

(Incluir no git add a página que de fato alimenta a tabela — conferir com git status.)

---

### Task 7: Fase B — formalizar a captura (páginas + anúncios + canais orgânicos)

O Bruno disse que "não tem nada instalado" — mas 372 vendas têm sck. A fonte provável são parâmetros de URL nos anúncios Meta. Esta task descobre, documenta e fecha os buracos.

**Files:**
- Create: `scripts/diag-url-tags.ts`
- Create: `public/t.js`
- Create: `docs/tracking-utm.md`

- [ ] **Step 1: Descobrir a origem do sck atual**

Criar `scripts/diag-url-tags.ts` que consulta a Graph API pros ads ativos e imprime o campo `url_tags` do creative (precisa de `META_SYSTEM_USER_TOKEN` — está só na Vercel; pedir ao Bruno exportar a var no shell antes de rodar, ou rodar via uma rota de debug autenticada). Estrutura do script: pra cada conta ativa (tabela `ad_accounts`), `GET /{act}/ads?fields=name,creative{url_tags},status&limit=100` e imprimir `name + url_tags`. Esperado: encontrar algo como `sck=s=MetaAds_{{placement}}|m=...|c={{campaign.name}}|co={{ad.name}}|t=pago` nos ads do Guia. **Reportar o achado ao Bruno e registrar em `docs/tracking-utm.md`** — essa config é a fonte do tracking pago e precisa ser replicada em TODA campanha nova.

- [ ] **Step 2: Documentar o template oficial de URL params dos anúncios**

Criar `docs/tracking-utm.md` com: o template exato encontrado no Step 1 (ou, se não houver, este template novo compatível com o parser):

```
sck=s=MetaAds_{{placement}}|m={{adset.name}}|c={{campaign.name}}|co={{ad.name}}|t=pago
```

instruções de onde colar (Gerenciador → anúncio → "Parâmetros de URL"), e a regra: **toda campanha nova precisa disso, senão a venda cai em "sem atribuição"**.

- [ ] **Step 3: Snippet `public/t.js` pras LPs**

Criar `public/t.js` (servido grátis em `https://dash-traqueamento.vercel.app/t.js`) — captura UTM/sck da URL, persiste first-touch por 30 dias, decora links de checkout Hotmart:

```js
/**
 * Tracking de origem pras LPs do OBA — first-touch 30d.
 * Instalação: <script src="https://dash-traqueamento.vercel.app/t.js" defer></script>
 * Captura ?sck= / ?utm_* da URL, persiste em localStorage, e decora todos os
 * links pay.hotmart.com da página. Formato compatível com o parser do dash.
 */
(function () {
  var KEY = "oba_trk";
  var TTL = 30 * 24 * 60 * 60 * 1000;

  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj.t || Date.now() - obj.t > TTL) return null;
      return obj.sck || null;
    } catch (e) { return null; }
  }

  function buildSckFromUrl() {
    var p = new URLSearchParams(location.search);
    if (p.get("sck")) return p.get("sck"); // já vem montado (anúncio)
    var s = p.get("utm_source"), m = p.get("utm_medium"),
        c = p.get("utm_campaign"), co = p.get("utm_content");
    if (!s) return null;
    var t = /organic/i.test(s) ? "organico" : "pago";
    var parts = ["s=" + s];
    if (m) parts.push("m=" + m);
    if (c) parts.push("c=" + c);
    if (co) parts.push("co=" + co);
    parts.push("t=" + t);
    return parts.join("|");
  }

  var fromUrl = buildSckFromUrl();
  var sck = readStored() || fromUrl; // first-touch: o guardado ganha
  if (fromUrl && !readStored()) {
    try { localStorage.setItem(KEY, JSON.stringify({ sck: fromUrl, t: Date.now() })); } catch (e) {}
  }
  if (!sck) return;

  function decorate() {
    var links = document.querySelectorAll('a[href*="pay.hotmart.com"]');
    for (var i = 0; i < links.length; i++) {
      try {
        var u = new URL(links[i].href);
        if (!u.searchParams.get("sck")) {
          u.searchParams.set("sck", sck);
          links[i].href = u.toString();
        }
      } catch (e) {}
    }
  }
  decorate();
  new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
})();
```

- [ ] **Step 4: Tabela de links orgânicos prontos**

Em `docs/tracking-utm.md`, adicionar a tabela de links por canal (Bruno cola na bio/grupo/email):

```
Bio Instagram:   <LP>?utm_source=Organico_Bio
Stories:         <LP>?utm_source=Organico_Stories
Grupo WhatsApp:  <checkout>?sck=s=Organico_Whatsapp|m=grupo|t=organico
E-mail:          <LP>?utm_source=Organico_Email
```

Regra: link DIRETO pro checkout usa `sck=` montado; link pra LP usa `utm_*` (o t.js converte e repassa).

- [ ] **Step 5: Verificar + commit**

Run: `npm run build` (t.js é estático, só confirmar que o build não reclama).

```bash
git add scripts/diag-url-tags.ts public/t.js docs/tracking-utm.md
git commit -m "feat: snippet t.js pras LPs + template de URL params dos anuncios + links organicos (docs/tracking-utm.md)"
```

---

### Task 8: Documentação no CLAUDE.md + validação E2E

**Files:**
- Modify: `CLAUDE.md` (do projeto)

- [ ] **Step 1: Registrar no CLAUDE.md**

Adicionar seção curta (perto da "Convenção de UTMs"): atribuição de venda em 3 baldes via `purchases.traffic_source` (parser `lib/hotmart/tracking.ts`); fonte = sck dos URL params dos anúncios + `t.js` nas LPs + links decorados (ver `docs/tracking-utm.md`); regra crítica: campanha nova sem URL params = venda em "sem atribuição".

- [ ] **Step 2: Validação E2E**

1. `npx tsc --noEmit && npm test && npm run build` — tudo verde.
2. Simular um webhook local (usar fixture do `route.test.ts` com `origin.sck` adicionado) e conferir que a compra entra com `traffic_source='trafego'` e `utm_campaign` preenchido.
3. Conferir no dash local: split aparece na Geral/Guia; tabela de campanhas mostra "Receita Hot"/"ROAS real" pra EXAUSTÃO.
4. Push da branch + PR (NÃO mergear sem o Bruno revisar os números).

- [ ] **Step 3: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: atribuicao organico/pago em 3 baldes + dependencias de captura"
```

---

## Fora do escopo (follow-ups conhecidos)

- Domínio próprio pro `t.js` (hoje serve do dash na Vercel — se o domínio mudar, atualizar as LPs)
- Atribuição por anúncio individual no dash (o `ad_external_id` já fica gravado — UI fica pra depois)
- Reclassificação periódica (se a regra mudar, rodar `backfill-tracking.ts` de novo — já é idempotente)
- Server-side tracking (CAPI-like) pra fugir de bloqueadores — só se o sem-atribuição ficar grande
- Importador da planilha histórica de UTMs → tabela `leads` (pendência antiga, independente)
