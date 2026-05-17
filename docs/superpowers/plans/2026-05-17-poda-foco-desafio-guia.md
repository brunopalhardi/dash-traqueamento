# Poda + Foco Desafio/Guia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolher o app pra foco em Desafio e Guia: deletar Instagram/C1/Sono/tracking-JS, adicionar webhook Hotmart + tabela `purchases`, e construir tabela de compradores da semana com indicador "no grupo WhatsApp".

**Architecture:** 5 PRs sequenciais. Cada uma é autocontida e deixa o app deployável. Reaproveita componentes existentes (KpiCard, FunnelChart, TopCreatives, GroupPanel, CycleSelector) e adiciona apenas `buyers-table.tsx`. Match comprador↔grupo via E.164 normalizado em ambos os lados.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, Postgres (Supabase), Vitest, shadcn/ui, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-17-poda-foco-desafio-guia-design.md`

---

## File map

### PR 1 — Hotmart webhook + tabela `purchases`

- Create: `lib/schema/purchases.ts` — schema Drizzle da tabela
- Modify: `lib/schema/index.ts` — exporta novo schema
- Create: `drizzle/0007_purchases.sql` — migration gerada via `drizzle-kit generate`
- Create: `app/api/webhooks/hotmart/route.ts` — webhook handler
- Create: `app/api/webhooks/hotmart/route.test.ts` — testes do parser/idempotência
- Create: `lib/hotmart/parser.ts` — função pura `parsePurchasePayload` (testável sem DB)
- Create: `lib/hotmart/parser.test.ts` — testes do parser

### PR 2 — Poda

- Delete: `app/(dashboard)/c1/`, `app/(dashboard)/sono/`, `app/(dashboard)/instagram/`
- Delete: `app/api/instagram/`, `app/api/track/`
- Delete: `public/track.js`
- Delete: `lib/instagram/`, `lib/sync/syncInstagram.ts`
- Delete: `lib/queries/instagram.ts`, `lib/queries/organic.ts`
- Delete: `lib/schema/instagram.ts`
- Delete: `components/dashboard/organic-panel.tsx`, `quality-donut.tsx`, `hierarchy-table.tsx`
- Modify: `lib/schema/index.ts` — remove export `./instagram`
- Modify: `lib/schema/leads.ts` — mantém tabela mas remove código dead (se houver)
- Modify: `lib/products.ts` — remove `c1`, `sono`, `lancamento` do array
- Modify: `components/dashboard/sidebar.tsx` — só Geral, Desafio, Guia
- Modify: `app/(dashboard)/desafio/page.tsx` — remove imports de OrganicPanel, QualityDonut, HierarchyTable e suas queries
- Modify: `app/(dashboard)/desafio/_metric-tabs.tsx` — só se referenciar algo deletado (provavelmente não)
- Modify: `lib/queries/dashboard.ts` — remove `getQualityScore` e `getHierarchyTable` se órfãos (verificar)
- Create: `drizzle/0008_drop_instagram.sql` — DROP nas tabelas `ig_*`

### PR 3 — Reescrever /guia + deletar template perpétuo

- Modify: `app/(dashboard)/guia/page.tsx` — reescrita completa (não usa mais template)
- Delete: `app/(dashboard)/_perpetuo-template.tsx`
- Delete: `app/(dashboard)/sono/` (se ainda não foi na PR 2 — verificar)

### PR 4 — Repaginar /desafio e Geral com novos KPIs semanais

- Modify: `app/(dashboard)/desafio/page.tsx` — ajusta KPIs pra incluir CPL e CAC (já tem ticket); remove Cycle comparison se Bruno não quiser
- Modify: `app/(dashboard)/page.tsx` — só Desafio e Guia em "Por produto"
- Modify: `lib/queries/dashboard.ts` — `getProductBreakdown` filtra só desafio+guia

### PR 5 — Tabela de compradores da semana com match no grupo

- Create: `lib/queries/purchases.ts` — `getBuyersForCycle(productSlug, range)`
- Create: `lib/queries/purchases.test.ts` — testes da query
- Create: `components/dashboard/buyers-table.tsx` — tabela visual
- Modify: `app/(dashboard)/desafio/page.tsx` — adiciona `<BuyersTable showInGroup />`
- Modify: `app/(dashboard)/guia/page.tsx` — adiciona `<BuyersTable />` sem `showInGroup`

---

## PR 1 — Hotmart webhook + tabela `purchases`

### Task 1.1: Schema Drizzle da tabela `purchases`

**Files:**
- Create: `lib/schema/purchases.ts`
- Modify: `lib/schema/index.ts`

- [ ] **Step 1: Criar schema da tabela**

Arquivo `lib/schema/purchases.ts`:

```typescript
import {
  pgTable,
  bigserial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Compras vindas do webhook do Hotmart.
 *
 * - transaction_id é UNIQUE pra idempotência (Hotmart faz retry).
 * - buyer_phone_e164 é normalizado via lib/utils/phone.ts (formato 55XXXXXXXXXXX)
 *   pra match com whatsapp_group_members.phone_normalized.
 * - status reflete o último evento processado: approved, refunded, chargeback.
 * - raw_payload sempre persistido pra debug (mesmo se parser falhar parcial).
 * ──────────────────────────────────────────────────────────────────────── */
export const purchases = pgTable(
  "purchases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    transactionId: text("transaction_id").notNull(),
    productSlug: text("product_slug").notNull(),
    productNameRaw: text("product_name_raw"),
    status: text("status").notNull(),
    buyerName: text("buyer_name"),
    buyerEmail: text("buyer_email"),
    buyerPhoneRaw: text("buyer_phone_raw"),
    buyerPhoneE164: text("buyer_phone_e164"),
    valueCents: integer("value_cents"),
    currency: text("currency"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchases_transaction_id_uq").on(t.transactionId),
    index("purchases_phone_idx").on(t.buyerPhoneE164),
    index("purchases_product_date_idx").on(t.productSlug, t.purchasedAt),
    index("purchases_status_idx").on(t.status),
  ],
);
```

- [ ] **Step 2: Exportar no schema index**

Editar `lib/schema/index.ts` (após `./whatsapp`):

```typescript
export * from "./meta";
export * from "./insights";
export * from "./leads";
export * from "./sync";
export * from "./instagram";
export * from "./whatsapp";
export * from "./purchases";
```

- [ ] **Step 3: Gerar migration**

```bash
npm run db:generate
```

Esperado: cria `drizzle/0007_*.sql` com `CREATE TABLE purchases` + índices. Renomear pra `0007_purchases.sql` se o nome gerado for diferente.

- [ ] **Step 4: Aplicar migration localmente**

```bash
npm run db:push
```

Esperado: sem erros, tabela `purchases` criada.

- [ ] **Step 5: Commit**

```bash
git add lib/schema/purchases.ts lib/schema/index.ts drizzle/0007_purchases.sql
git commit -m "feat(hotmart): schema da tabela purchases"
```

### Task 1.2: Parser do payload Hotmart (função pura testável)

**Files:**
- Create: `lib/hotmart/parser.ts`
- Test: `lib/hotmart/parser.test.ts`

Hotmart envia payloads com estrutura `{ event: "PURCHASE_APPROVED", data: { product: {...}, buyer: {...}, purchase: {...} } }`. Doc oficial: https://developers.hotmart.com/docs/en/v1/webhooks/events/. O parser deve ser tolerante a variações (campos faltando) e devolver um shape estável.

- [ ] **Step 1: Escrever testes (TDD)**

Arquivo `lib/hotmart/parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parsePurchasePayload } from "./parser";

const samplePayload = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { id: 1234567, name: "Desafio 7 Dias Alzheimer" },
    buyer: {
      name: "Maria Silva",
      email: "maria@example.com",
      checkout_phone: "+55 11 98765-4321",
    },
    purchase: {
      transaction: "HP1234567890",
      status: "APPROVED",
      approved_date: 1735689600000,
      price: { value: 197.0, currency_value: "BRL" },
    },
  },
};

describe("parsePurchasePayload", () => {
  it("extrai campos básicos de um PURCHASE_APPROVED", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result).not.toBeNull();
    expect(result!.transactionId).toBe("HP1234567890");
    expect(result!.event).toBe("PURCHASE_APPROVED");
    expect(result!.status).toBe("approved");
    expect(result!.buyerName).toBe("Maria Silva");
    expect(result!.buyerEmail).toBe("maria@example.com");
    expect(result!.buyerPhoneRaw).toBe("+55 11 98765-4321");
    expect(result!.buyerPhoneE164).toBe("5511987654321");
    expect(result!.valueCents).toBe(19700);
    expect(result!.currency).toBe("BRL");
    expect(result!.productNameRaw).toBe("Desafio 7 Dias Alzheimer");
    expect(result!.purchasedAt).toBeInstanceOf(Date);
  });

  it("mapeia PURCHASE_REFUNDED pra status refunded", () => {
    const result = parsePurchasePayload({ ...samplePayload, event: "PURCHASE_REFUNDED" });
    expect(result!.status).toBe("refunded");
  });

  it("mapeia PURCHASE_CHARGEBACK pra status chargeback", () => {
    const result = parsePurchasePayload({ ...samplePayload, event: "PURCHASE_CHARGEBACK" });
    expect(result!.status).toBe("chargeback");
  });

  it("retorna null se faltar transaction_id", () => {
    const bad = {
      event: "PURCHASE_APPROVED",
      data: { ...samplePayload.data, purchase: { ...samplePayload.data.purchase, transaction: undefined } },
    };
    expect(parsePurchasePayload(bad)).toBeNull();
  });

  it("aceita event no root e telefone em formato bruto sem +", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        buyer: { ...samplePayload.data.buyer, checkout_phone: "11987654321" },
      },
    });
    expect(result!.buyerPhoneE164).toBe("5511987654321");
  });

  it("classifica produto via regex do products.ts (desafio)", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result!.productSlug).toBe("desafio");
  });

  it("classifica produto Guia", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        product: { id: 999, name: "Guia Completo do Alzheimer" },
      },
    });
    expect(result!.productSlug).toBe("guia");
  });

  it("retorna 'outros' quando produto não casa", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: { ...samplePayload.data, product: { id: 999, name: "Produto Random" } },
    });
    expect(result!.productSlug).toBe("outros");
  });
});
```

- [ ] **Step 2: Rodar testes (devem falhar)**

```bash
npx vitest run lib/hotmart/parser.test.ts
```

Esperado: erro de import (módulo `./parser` não existe).

- [ ] **Step 3: Implementar `lib/hotmart/parser.ts`**

```typescript
import { normalizePhone } from "@/lib/utils/phone";
import { PRODUCTS, type ProductSlug } from "@/lib/products";

export interface ParsedPurchase {
  event: "PURCHASE_APPROVED" | "PURCHASE_REFUNDED" | "PURCHASE_CHARGEBACK";
  status: "approved" | "refunded" | "chargeback";
  transactionId: string;
  productSlug: ProductSlug | "outros";
  productNameRaw: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneRaw: string | null;
  buyerPhoneE164: string | null;
  valueCents: number | null;
  currency: string | null;
  purchasedAt: Date;
}

const EVENT_TO_STATUS = {
  PURCHASE_APPROVED: "approved",
  PURCHASE_REFUNDED: "refunded",
  PURCHASE_CHARGEBACK: "chargeback",
} as const;

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (typeof v === "number") return v > 1e12 ? new Date(v) : new Date(v * 1000);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && /^\d+$/.test(v)) {
      return n > 1e12 ? new Date(n) : new Date(n * 1000);
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function detectProductByName(name: string | null): ProductSlug | "outros" {
  if (!name) return "outros";
  for (const p of PRODUCTS) {
    if (p.slug === "geral" || p.slug === "lancamento") continue;
    if (p.namePattern && p.namePattern.test(name)) return p.slug;
  }
  // Fallback: keywords explícitas
  if (/desafio/i.test(name)) return "desafio";
  if (/guia/i.test(name)) return "guia";
  return "outros";
}

export function parsePurchasePayload(raw: unknown): ParsedPurchase | null {
  const root = asObj(raw);
  if (!root) return null;

  const eventStr = pick<string>(root, ["event", "event_type"]);
  if (!eventStr || !(eventStr in EVENT_TO_STATUS)) return null;
  const event = eventStr as keyof typeof EVENT_TO_STATUS;

  const data = asObj(root.data) ?? root;
  const product = asObj(data.product);
  const buyer = asObj(data.buyer);
  const purchase = asObj(data.purchase) ?? data;

  const transactionId = pick<string>(purchase, [
    "transaction",
    "transaction_id",
    "id",
  ]);
  if (!transactionId) return null;

  const productName = product ? pick<string>(product, ["name", "product_name"]) ?? null : null;
  const buyerName = buyer ? pick<string>(buyer, ["name", "buyer_name", "full_name"]) ?? null : null;
  const buyerEmail = buyer ? pick<string>(buyer, ["email", "buyer_email"]) ?? null : null;
  const buyerPhoneRaw = buyer
    ? pick<string>(buyer, ["checkout_phone", "phone", "phone_number", "telefone"]) ?? null
    : null;

  const priceObj = asObj(purchase.price);
  const valueNum =
    pick<number | string>(priceObj ?? purchase, [
      "value",
      "price",
      "amount",
      "total_value",
    ]) ?? null;
  const valueCents =
    valueNum != null ? Math.round(Number(valueNum) * 100) : null;

  const currency =
    pick<string>(priceObj ?? purchase, ["currency_value", "currency", "currency_code"]) ?? null;

  const purchasedAt = toDate(
    pick<string | number>(purchase, [
      "approved_date",
      "order_date",
      "purchase_date",
      "creation_date",
    ]),
  );

  return {
    event,
    status: EVENT_TO_STATUS[event],
    transactionId: String(transactionId),
    productSlug: detectProductByName(productName),
    productNameRaw: productName,
    buyerName,
    buyerEmail,
    buyerPhoneRaw,
    buyerPhoneE164: normalizePhone(buyerPhoneRaw),
    valueCents: Number.isFinite(valueCents) ? valueCents : null,
    currency,
    purchasedAt,
  };
}
```

- [ ] **Step 4: Rodar testes (devem passar)**

```bash
npx vitest run lib/hotmart/parser.test.ts
```

Esperado: 8 testes passando.

- [ ] **Step 5: Commit**

```bash
git add lib/hotmart/parser.ts lib/hotmart/parser.test.ts
git commit -m "feat(hotmart): parser de payload com testes (TDD)"
```

### Task 1.3: Webhook handler com idempotência

**Files:**
- Create: `app/api/webhooks/hotmart/route.ts`
- Test: `app/api/webhooks/hotmart/route.test.ts`

- [ ] **Step 1: Escrever testes de integração**

Arquivo `app/api/webhooks/hotmart/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "./route";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { eq } from "drizzle-orm";

const TOKEN = "test-hottok-123";
const payload = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { name: "Desafio 7 Dias" },
    buyer: {
      name: "João Teste",
      email: "joao@test.com",
      checkout_phone: "+5511999998888",
    },
    purchase: {
      transaction: "HP-TEST-1",
      approved_date: Date.now(),
      price: { value: 197, currency_value: "BRL" },
    },
  },
};

function buildReq(body: unknown, opts: { token?: string | null } = {}) {
  const url = new URL("http://localhost/api/webhooks/hotmart");
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.token !== null) {
    headers.set("x-hotmart-hottok", opts.token ?? TOKEN);
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/hotmart", () => {
  beforeEach(async () => {
    process.env.HOTTOK = TOKEN;
    await db.delete(purchases).where(eq(purchases.transactionId, "HP-TEST-1"));
  });

  it("rejeita 401 sem token", async () => {
    const res = await POST(buildReq(payload, { token: null }));
    expect(res.status).toBe(401);
  });

  it("rejeita 401 com token errado", async () => {
    const res = await POST(buildReq(payload, { token: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("persiste compra approved", async () => {
    const res = await POST(buildReq(payload));
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-TEST-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].productSlug).toBe("desafio");
    expect(rows[0].buyerPhoneE164).toBe("5511999998888");
  });

  it("é idempotente: replay não duplica linha", async () => {
    await POST(buildReq(payload));
    await POST(buildReq(payload));
    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-TEST-1"));
    expect(rows).toHaveLength(1);
  });

  it("atualiza status quando vem REFUNDED depois", async () => {
    await POST(buildReq(payload));
    await POST(buildReq({ ...payload, event: "PURCHASE_REFUNDED" }));
    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-TEST-1"));
    expect(rows[0].status).toBe("refunded");
  });

  it("payload sem transaction_id retorna 400", async () => {
    const bad = {
      event: "PURCHASE_APPROVED",
      data: { ...payload.data, purchase: { ...payload.data.purchase, transaction: undefined } },
    };
    const res = await POST(buildReq(bad));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/webhooks/hotmart", () => {
  it("retorna 200 com status", async () => {
    process.env.HOTTOK = TOKEN;
    const req = new NextRequest(new URL("http://localhost/api/webhooks/hotmart"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.service).toBe("hotmart-webhook");
  });
});
```

- [ ] **Step 2: Rodar testes (devem falhar)**

```bash
npx vitest run app/api/webhooks/hotmart/route.test.ts
```

Esperado: erro de import (módulo `./route` não existe).

- [ ] **Step 3: Implementar `app/api/webhooks/hotmart/route.ts`**

```typescript
/**
 * Webhook do Hotmart — recebe eventos de compra aprovada/reembolso/chargeback.
 *
 * Configuração no painel Hotmart:
 *   URL: https://dash-traqueamento.vercel.app/api/webhooks/hotmart
 *   Eventos: PURCHASE_APPROVED, PURCHASE_REFUNDED, PURCHASE_CHARGEBACK
 *   Hottok: valor de HOTTOK na Vercel
 *
 * Auth: header X-Hotmart-Hottok deve bater com env HOTTOK.
 * Idempotência: ON CONFLICT (transaction_id) DO UPDATE.
 *
 * GET na mesma URL retorna 200 com status — útil pro Hotmart validar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { parsePurchasePayload } from "@/lib/hotmart/parser";

export const dynamic = "force-dynamic";

function tokenFromRequest(req: NextRequest): string | null {
  return (
    req.headers.get("x-hotmart-hottok") ??
    req.nextUrl.searchParams.get("hottok") ??
    null
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "hotmart-webhook",
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.HOTTOK;
  if (!expected) {
    return NextResponse.json(
      { error: "HOTTOK não configurado no servidor" },
      { status: 503 },
    );
  }
  if (tokenFromRequest(req) !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parsePurchasePayload(raw);
  if (!parsed) {
    console.warn("[hotmart] payload inválido — sem transaction_id ou event desconhecido", raw);
    return NextResponse.json(
      { error: "payload inválido: faltam transaction_id e/ou event" },
      { status: 400 },
    );
  }

  const now = new Date();

  await db
    .insert(purchases)
    .values({
      transactionId: parsed.transactionId,
      productSlug: parsed.productSlug,
      productNameRaw: parsed.productNameRaw,
      status: parsed.status,
      buyerName: parsed.buyerName,
      buyerEmail: parsed.buyerEmail,
      buyerPhoneRaw: parsed.buyerPhoneRaw,
      buyerPhoneE164: parsed.buyerPhoneE164,
      valueCents: parsed.valueCents,
      currency: parsed.currency,
      purchasedAt: parsed.purchasedAt,
      rawPayload: raw as object,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: purchases.transactionId,
      set: {
        status: parsed.status,
        // Não sobrescreve dados do comprador com null em retries com payload reduzido
        buyerName: sql`coalesce(excluded.buyer_name, ${purchases.buyerName})`,
        buyerEmail: sql`coalesce(excluded.buyer_email, ${purchases.buyerEmail})`,
        buyerPhoneRaw: sql`coalesce(excluded.buyer_phone_raw, ${purchases.buyerPhoneRaw})`,
        buyerPhoneE164: sql`coalesce(excluded.buyer_phone_e164, ${purchases.buyerPhoneE164})`,
        rawPayload: raw as object,
        updatedAt: now,
      },
    });

  return NextResponse.json({
    ok: true,
    transactionId: parsed.transactionId,
    status: parsed.status,
  });
}
```

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run app/api/webhooks/hotmart/route.test.ts
```

Esperado: 7 testes passando. Se algum DB-bound falhar localmente porque DATABASE_URL não está setado, ajustar `.env.local` antes.

- [ ] **Step 5: Verificar tipos e lint**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/hotmart/
git commit -m "feat(hotmart): webhook /api/webhooks/hotmart com idempotência"
```

### Task 1.4: Documentar no CLAUDE.md e validar deploy

- [ ] **Step 1: Atualizar CLAUDE.md**

Editar `CLAUDE.md` na seção "Pendências imediatas" — substituir item da "Fase 5" por:

```
4. **Bruno cadastrar Hotmart webhook em produção** — gerar `HOTTOK` na Vercel
   e cadastrar webhook no painel Hotmart apontando pra
   `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` com eventos
   `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`.
```

E adicionar na seção "Concluído":

```
- ✅ **Hotmart webhook + tabela purchases** — `/api/webhooks/hotmart` aceita
  APPROVED/REFUNDED/CHARGEBACK; idempotência via `transaction_id`; match com
  grupo WhatsApp via `buyer_phone_e164`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: hotmart webhook concluído"
```

---

## PR 2 — Poda

### Task 2.1: Remover dashboards C1, Sono e suas rotas

**Files:**
- Delete: `app/(dashboard)/c1/`
- Delete: `app/(dashboard)/sono/`

- [ ] **Step 1: Deletar diretórios**

```bash
rm -rf app/\(dashboard\)/c1/ app/\(dashboard\)/sono/
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit
```

Esperado: 0 erros (nenhum import órfão de C1/Sono).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dashboards C1 e Sono"
```

### Task 2.2: Remover stack inteira do Instagram

**Files:**
- Delete: `app/(dashboard)/instagram/`
- Delete: `app/api/instagram/`
- Delete: `lib/instagram/`
- Delete: `lib/sync/syncInstagram.ts`
- Delete: `lib/queries/instagram.ts`
- Delete: `lib/schema/instagram.ts`
- Modify: `lib/schema/index.ts`
- Create: `drizzle/0008_drop_instagram.sql`

- [ ] **Step 1: Identificar imports cruzados**

```bash
grep -rn "lib/instagram\|lib/sync/syncInstagram\|lib/queries/instagram\|lib/schema/instagram\|/instagram" \
  app components lib --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Esperado: ocorrências só dentro de arquivos a deletar e do export em `lib/schema/index.ts`.

- [ ] **Step 2: Deletar arquivos**

```bash
rm -rf app/\(dashboard\)/instagram/ app/api/instagram/ lib/instagram/ \
  lib/sync/syncInstagram.ts lib/queries/instagram.ts lib/schema/instagram.ts
```

- [ ] **Step 3: Tirar export do schema index**

Editar `lib/schema/index.ts` — remover linha `export * from "./instagram";`. O arquivo fica:

```typescript
export * from "./meta";
export * from "./insights";
export * from "./leads";
export * from "./sync";
export * from "./whatsapp";
export * from "./purchases";
```

- [ ] **Step 4: Criar migration de DROP**

Arquivo `drizzle/0008_drop_instagram.sql`:

```sql
DROP TABLE IF EXISTS "ig_media_insights" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ig_media" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ig_insights_daily" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ig_accounts" CASCADE;
```

- [ ] **Step 5: Aplicar localmente**

```bash
npm run db:push
```

Esperado: drizzle pode pedir confirmação pra dropar tabelas — confirmar.

- [ ] **Step 6: Verificar build**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(instagram): remove stack inteira (rota, sync, schema, queries)"
```

### Task 2.3: Remover tracking JS e organic panel

**Files:**
- Delete: `public/track.js`
- Delete: `app/api/track/`
- Delete: `components/dashboard/organic-panel.tsx`
- Delete: `lib/queries/organic.ts`

(Tabela `leads` e `lib/schema/leads.ts` permanecem — importador da planilha vai usar depois.)

- [ ] **Step 1: Verificar consumidores**

```bash
grep -rn "track.js\|/api/track\|organic-panel\|getOrganicSummary\|queries/organic" \
  app components lib public --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules
```

Esperado: ocorrências em arquivos a deletar + import no `app/(dashboard)/desafio/page.tsx`.

- [ ] **Step 2: Deletar arquivos**

```bash
rm -f public/track.js
rm -rf app/api/track/
rm -f components/dashboard/organic-panel.tsx lib/queries/organic.ts
```

- [ ] **Step 3: Limpar imports e uso no /desafio**

Editar `app/(dashboard)/desafio/page.tsx`:

- Remover linha 10: `import { getOrganicSummary } from "@/lib/queries/organic";`
- Remover linha 20: `import { OrganicPanel } from "@/components/dashboard/organic-panel";`
- Remover entrada `getOrganicSummary("desafio", currentRange)` do array do `Promise.all` (linha 69) e a variável `organic` do destructuring
- Remover o bloco `<Card>` "Painel Orgânico" (linhas 204-214)

(Limpeza final dos painéis fica pra Task 2.4 — aqui só tira o que ficou órfão pela remoção.)

- [ ] **Step 4: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(track): remove track.js, /api/track, organic-panel e query"
```

### Task 2.4: Remover painéis fora de escopo do /desafio (Quality, Hierarchy)

**Files:**
- Delete: `components/dashboard/quality-donut.tsx`
- Delete: `components/dashboard/hierarchy-table.tsx`
- Modify: `app/(dashboard)/desafio/page.tsx`
- Modify: `lib/queries/dashboard.ts` (remover queries órfãs)

- [ ] **Step 1: Editar `app/(dashboard)/desafio/page.tsx`**

Resultado esperado do arquivo (substitui o atual; assume Task 2.3 já feita):

```typescript
import {
  getCycleOverlay,
  getFunnelMetrics,
  getHierarchyTable,
  getKpis,
  rangeCurrentCycle,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { getWhatsappSummary } from "@/lib/queries/whatsapp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CycleSelector } from "@/components/dashboard/cycle-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { fmt } from "@/components/dashboard/format";
import { GroupPanel } from "@/components/dashboard/group-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { TopCreatives } from "@/components/dashboard/top-creatives";
import { CycleMetricTabs } from "./_metric-tabs";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE = 7;
const CYCLES_BACK = 4;

function parseCycle(sp: { cycle?: string; start?: string; end?: string }) {
  const custom =
    sp.start && sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) && /^\d{4}-\d{2}-\d{2}$/.test(sp.end)
      ? { start: sp.start, end: sp.end }
      : undefined;
  if (custom) {
    const days =
      Math.round(
        (new Date(custom.end + "T00:00:00").getTime() -
          new Date(custom.start + "T00:00:00").getTime()) /
          86400000,
      ) + 1;
    return { cycleDays: Math.max(1, days), custom };
  }
  const n = Number(sp.cycle ?? DEFAULT_CYCLE);
  return { cycleDays: Number.isFinite(n) && n > 0 ? n : DEFAULT_CYCLE, custom };
}

export default async function DesafioPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const { cycleDays, custom } = parseCycle(sp);

  const currentRange = rangeCurrentCycle(cycleDays, custom);
  const prevRange = rangePreviousCycle(currentRange);

  const [kpis, prevKpis, overlay, funnel, adsTbl, whatsapp] = await Promise.all([
    getKpis("desafio", currentRange),
    getKpis("desafio", prevRange),
    getCycleOverlay("desafio", { cycleDays, cyclesBack: CYCLES_BACK, custom }),
    getFunnelMetrics("desafio", currentRange),
    getHierarchyTable("desafio", currentRange, "ad"),
    getWhatsappSummary("desafio", currentRange),
  ]);

  const hasData = overlay.some((p) => p.cycleOffset === 0);
  const subtitle = custom
    ? `Custom · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)} (${cycleDays} dias)`
    : `Ciclo ${cycleDays} dias · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}  (vs ciclo anterior)`;

  const funnelStages = [
    {
      label: "Impressões",
      value: fmt.int(funnel.impressions, true),
      hint: `CPM ${fmt.money(funnel.cpm)}`,
      width: 1,
    },
    {
      label: "Cliques",
      value: fmt.int(funnel.clicks, true),
      hint: `CTR ${fmt.pct(funnel.ctr, 2)}`,
      width: Math.max(0.4, funnel.clicks / Math.max(funnel.impressions, 1)),
    },
    {
      label: "Vendas",
      value: fmt.int(funnel.purchases),
      hint: `Tx. Conv ${fmt.pct(funnel.conversionRate, 2)}`,
      width: Math.max(0.2, funnel.purchases / Math.max(funnel.clicks, 1)),
    },
  ];

  return (
    <>
      <PageHeader
        title="Desafio"
        subtitle={subtitle}
        hidePicker
        right={<CycleSelector defaultCycle={DEFAULT_CYCLE} />}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Investido"
          value={fmt.money(kpis.spend)}
          delta={fmt.delta(kpis.spend, prevKpis.spend)}
          invertDelta
        />
        <KpiCard
          label="Leads"
          value={fmt.int(kpis.leads)}
          delta={fmt.delta(kpis.leads, prevKpis.leads)}
        />
        <KpiCard
          label="Vendas"
          value={fmt.int(kpis.purchases)}
          delta={fmt.delta(kpis.purchases, prevKpis.purchases)}
        />
        <KpiCard
          label="Receita"
          value={fmt.money(kpis.revenue)}
          delta={fmt.delta(kpis.revenue, prevKpis.revenue)}
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(kpis.roas)}
          delta={fmt.delta(kpis.roas, prevKpis.roas)}
        />
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Comparação de ciclos · últimos {CYCLES_BACK + 1} ciclos de {cycleDays} dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <CycleMetricTabs points={overlay} cycleDays={cycleDays} />
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Tráfego</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart stages={funnelStages} />
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Principais criativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopCreatives ads={adsTbl} limit={5} />
          </CardContent>
        </Card>
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Grupos WhatsApp — SendFlow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GroupPanel data={whatsapp} />
        </CardContent>
      </Card>
    </>
  );
}
```

(Tabela hierárquica e Quality Donut saem; Buyers Table entra na PR 5.)

- [ ] **Step 2: Deletar componentes órfãos**

```bash
rm -f components/dashboard/quality-donut.tsx components/dashboard/hierarchy-table.tsx
```

- [ ] **Step 3: Identificar queries órfãs**

```bash
grep -rn "getQualityScore" app components lib --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Esperado: só a definição em `lib/queries/dashboard.ts`.

- [ ] **Step 4: Remover `getQualityScore` de `lib/queries/dashboard.ts`**

Procurar a função `getQualityScore` e a interface `QualityScore` exportada e remover. **Manter** `getHierarchyTable` — ainda é usado pelo `TopCreatives` via `adsTbl`.

- [ ] **Step 5: Verificar build**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(desafio): remove Quality Donut e Hierarchy Table"
```

### Task 2.5: Reduzir catálogo de produtos e sidebar

**Files:**
- Modify: `lib/products.ts`
- Modify: `components/dashboard/sidebar.tsx`
- Modify: `lib/queries/dashboard.ts` (se `getProductBreakdown` precisar update)

- [ ] **Step 1: Editar `lib/products.ts`**

Reduzir o `PRODUCTS` array pra:

```typescript
export type ProductSlug = "geral" | "desafio" | "guia";

// ... interface Product igual ...

export const PRODUCTS: Product[] = [
  {
    slug: "geral",
    label: "Geral",
    shortLabel: "Geral",
    description: "Visão consolidada de Desafio e Guia",
    metaAccountId: null,
    namePattern: null,
    accent: "violet-500",
    defaultRangeDays: 7,
  },
  {
    slug: "desafio",
    label: "Desafio",
    shortLabel: "Desafio",
    description: "Vendas do desafio semanal (ciclo seg→dom)",
    metaAccountId: "act_1394993860878989",
    namePattern: /VENDAS-DESAFIO/i,
    accent: "fuchsia-500",
    defaultRangeDays: 7,
  },
  {
    slug: "guia",
    label: "Guia",
    shortLabel: "Guia",
    description: "Produto perpétuo, ticket maior",
    metaAccountId: "act_972744231680763",
    namePattern: /PERPETUO-GUIA|GUIA.*OBA/i,
    accent: "amber-500",
    defaultRangeDays: 30,
  },
];

export function getProduct(slug: ProductSlug): Product {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Produto desconhecido: ${slug}`);
  return p;
}

export function getDashboardProducts(): Product[] {
  return PRODUCTS;
}

export function detectProduct(
  campaignName: string,
  metaAccountId: string,
): ProductSlug | "outros" {
  for (const p of PRODUCTS) {
    if (p.slug === "geral") continue;
    if (p.metaAccountId && p.metaAccountId !== metaAccountId) continue;
    if (p.namePattern && p.namePattern.test(campaignName)) return p.slug;
  }
  return "outros";
}
```

- [ ] **Step 2: Editar `components/dashboard/sidebar.tsx`**

Substituir o `items` array pra:

```typescript
const items = [
  { href: "/", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/desafio", label: "Desafio", icon: Calendar },
  { href: "/guia", label: "Guia", icon: BookOpen },
];
```

E remover imports não usados (`Users`, `Moon`, `Camera`, `Sun`).

- [ ] **Step 3: Verificar build**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: 0 erros. Se algum lugar tiver `ProductSlug === "c1"` ou similar, fix.

- [ ] **Step 4: Rodar testes**

```bash
npm test
```

Esperado: tudo passa.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: reduz catálogo a Desafio + Guia; sidebar limpa"
```

---

## PR 3 — Reescrever /guia e deletar template perpétuo

### Task 3.1: Reescrever `/guia/page.tsx`

**Files:**
- Modify: `app/(dashboard)/guia/page.tsx`
- Delete: `app/(dashboard)/_perpetuo-template.tsx`

- [ ] **Step 1: Substituir `app/(dashboard)/guia/page.tsx`**

Conteúdo:

```typescript
import {
  getCycleOverlay,
  getFunnelMetrics,
  getHierarchyTable,
  getKpis,
  rangeCurrentCycle,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CycleSelector } from "@/components/dashboard/cycle-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { TopCreatives } from "@/components/dashboard/top-creatives";
import { CycleMetricTabs } from "../desafio/_metric-tabs";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE = 30;
const CYCLES_BACK = 3;

function parseCycle(sp: { cycle?: string; start?: string; end?: string }) {
  const custom =
    sp.start && sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) && /^\d{4}-\d{2}-\d{2}$/.test(sp.end)
      ? { start: sp.start, end: sp.end }
      : undefined;
  if (custom) {
    const days =
      Math.round(
        (new Date(custom.end + "T00:00:00").getTime() -
          new Date(custom.start + "T00:00:00").getTime()) /
          86400000,
      ) + 1;
    return { cycleDays: Math.max(1, days), custom };
  }
  const n = Number(sp.cycle ?? DEFAULT_CYCLE);
  return { cycleDays: Number.isFinite(n) && n > 0 ? n : DEFAULT_CYCLE, custom };
}

export default async function GuiaPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const { cycleDays, custom } = parseCycle(sp);

  const currentRange = rangeCurrentCycle(cycleDays, custom);
  const prevRange = rangePreviousCycle(currentRange);

  const [kpis, prevKpis, overlay, funnel, adsTbl] = await Promise.all([
    getKpis("guia", currentRange),
    getKpis("guia", prevRange),
    getCycleOverlay("guia", { cycleDays, cyclesBack: CYCLES_BACK, custom }),
    getFunnelMetrics("guia", currentRange),
    getHierarchyTable("guia", currentRange, "ad"),
  ]);

  const hasData = overlay.some((p) => p.cycleOffset === 0);
  const subtitle = custom
    ? `Custom · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)} (${cycleDays} dias)`
    : `Janela ${cycleDays} dias · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}  (vs período anterior)`;

  const funnelStages = [
    {
      label: "Impressões",
      value: fmt.int(funnel.impressions, true),
      hint: `CPM ${fmt.money(funnel.cpm)}`,
      width: 1,
    },
    {
      label: "Cliques",
      value: fmt.int(funnel.clicks, true),
      hint: `CTR ${fmt.pct(funnel.ctr, 2)}`,
      width: Math.max(0.4, funnel.clicks / Math.max(funnel.impressions, 1)),
    },
    {
      label: "Vendas",
      value: fmt.int(funnel.purchases),
      hint: `Tx. Conv ${fmt.pct(funnel.conversionRate, 2)}`,
      width: Math.max(0.2, funnel.purchases / Math.max(funnel.clicks, 1)),
    },
  ];

  return (
    <>
      <PageHeader
        title="Guia"
        subtitle={subtitle}
        hidePicker
        right={<CycleSelector defaultCycle={DEFAULT_CYCLE} />}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Investido" value={fmt.money(kpis.spend)} delta={fmt.delta(kpis.spend, prevKpis.spend)} invertDelta />
        <KpiCard label="Leads" value={fmt.int(kpis.leads)} delta={fmt.delta(kpis.leads, prevKpis.leads)} />
        <KpiCard label="Vendas" value={fmt.int(kpis.purchases)} delta={fmt.delta(kpis.purchases, prevKpis.purchases)} />
        <KpiCard label="Receita" value={fmt.money(kpis.revenue)} delta={fmt.delta(kpis.revenue, prevKpis.revenue)} />
        <KpiCard label="ROAS" value={fmt.ratio(kpis.roas)} delta={fmt.delta(kpis.roas, prevKpis.roas)} />
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Comparação de períodos · últimos {CYCLES_BACK + 1} períodos de {cycleDays} dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? <CycleMetricTabs points={overlay} cycleDays={cycleDays} /> : <EmptyState />}
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Tráfego</CardTitle>
          </CardHeader>
          <CardContent><FunnelChart stages={funnelStages} /></CardContent>
        </Card>

        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Principais criativos
            </CardTitle>
          </CardHeader>
          <CardContent><TopCreatives ads={adsTbl} limit={5} /></CardContent>
        </Card>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Deletar o template perpétuo**

```bash
rm -f app/\(dashboard\)/_perpetuo-template.tsx
```

- [ ] **Step 3: Verificar build e rodar dev**

```bash
npx tsc --noEmit && npm run lint
```

Em outro terminal, opcional: `npm run dev` e abrir `/guia` no browser. Esperar layout idêntico ao /desafio mas com dados do produto Guia.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(guia): reescrita sem template + deleta _perpetuo-template"
```

---

## PR 4 — Repaginar Geral

### Task 4.1: Atualizar `getProductBreakdown` pra só Desafio + Guia

**Files:**
- Modify: `lib/queries/dashboard.ts`

- [ ] **Step 1: Conferir lógica atual**

```bash
grep -n "getProductBreakdown\|detectProduct" lib/queries/dashboard.ts
```

A função usa `PRODUCTS` filtrando `slug !== "geral"` e chama `detectProduct()`. Depois da redução em PR 2 task 2.5, ela já vai retornar só Desafio + Guia automaticamente. **Nenhuma mudança necessária aqui** — só validar.

- [ ] **Step 2: Rodar dev e verificar `/`**

```bash
npm run dev
```

Abrir `http://localhost:3000/` — esperado: KPIs consolidados + tabela "Por produto" com só Desafio e Guia.

- [ ] **Step 3: Sem commit** se nenhuma mudança foi necessária. Caso a tabela mostre "outros" ou algo inesperado, ajustar `detectProduct` em `lib/products.ts` e commitar:

```bash
git add lib/queries/dashboard.ts lib/products.ts
git commit -m "fix(geral): product breakdown só com Desafio e Guia"
```

---

## PR 5 — Tabela de compradores com match no grupo

### Task 5.1: Query `getBuyersForCycle`

**Files:**
- Create: `lib/queries/purchases.ts`
- Test: `lib/queries/purchases.test.ts`

- [ ] **Step 1: Escrever teste**

Arquivo `lib/queries/purchases.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { whatsappGroupMembers, whatsappGroups } from "@/lib/schema/whatsapp";
import { eq } from "drizzle-orm";
import { getBuyersForCycle } from "./purchases";

const PHONE_IN_GROUP = "5511111111111";
const PHONE_OUT = "5522222222222";
const PHONE_NULL = null;

beforeAll(async () => {
  // Cleanup
  await db.delete(purchases).where(eq(purchases.transactionId, "T-IN"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-OUT"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-NULL"));
  await db.delete(whatsappGroupMembers).where(eq(whatsappGroupMembers.phoneNormalized, PHONE_IN_GROUP));
  await db.delete(whatsappGroups).where(eq(whatsappGroups.externalId, "TEST-GRP"));

  // Setup grupo + 1 membro dentro
  const [g] = await db.insert(whatsappGroups).values({
    externalId: "TEST-GRP",
    name: "Desafio Teste",
    productSlug: "desafio",
  }).returning({ id: whatsappGroups.id });

  await db.insert(whatsappGroupMembers).values({
    groupId: g.id,
    groupExternalId: "TEST-GRP",
    phoneNormalized: PHONE_IN_GROUP,
    name: "Pessoa Dentro",
    lastEventAt: new Date(),
    lastEventType: "joined",
    currentlyInGroup: true,
  });

  // Setup 3 compras do desafio na semana
  const now = new Date();
  await db.insert(purchases).values([
    {
      transactionId: "T-IN", productSlug: "desafio", status: "approved",
      buyerName: "A", buyerPhoneE164: PHONE_IN_GROUP, valueCents: 19700,
      purchasedAt: now, rawPayload: {},
    },
    {
      transactionId: "T-OUT", productSlug: "desafio", status: "approved",
      buyerName: "B", buyerPhoneE164: PHONE_OUT, valueCents: 19700,
      purchasedAt: now, rawPayload: {},
    },
    {
      transactionId: "T-NULL", productSlug: "desafio", status: "approved",
      buyerName: "C", buyerPhoneE164: PHONE_NULL, valueCents: 19700,
      purchasedAt: now, rawPayload: {},
    },
  ]);
});

afterAll(async () => {
  await db.delete(purchases).where(eq(purchases.transactionId, "T-IN"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-OUT"));
  await db.delete(purchases).where(eq(purchases.transactionId, "T-NULL"));
  await db.delete(whatsappGroupMembers).where(eq(whatsappGroupMembers.phoneNormalized, PHONE_IN_GROUP));
  await db.delete(whatsappGroups).where(eq(whatsappGroups.externalId, "TEST-GRP"));
});

describe("getBuyersForCycle", () => {
  it("retorna compradores aprovados do período com flag inGroup correta", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

    const buyers = await getBuyersForCycle("desafio", { from, to });

    const map = new Map(buyers.map((b) => [b.transactionId, b]));
    expect(map.get("T-IN")?.inGroup).toBe(true);
    expect(map.get("T-OUT")?.inGroup).toBe(false);
    expect(map.get("T-NULL")?.inGroup).toBe(null);
  });

  it("ignora compras refunded/chargeback", async () => {
    await db.update(purchases).set({ status: "refunded" }).where(eq(purchases.transactionId, "T-IN"));
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const buyers = await getBuyersForCycle("desafio", { from, to });
    expect(buyers.find((b) => b.transactionId === "T-IN")).toBeUndefined();
    // Restore for further tests if any
    await db.update(purchases).set({ status: "approved" }).where(eq(purchases.transactionId, "T-IN"));
  });
});
```

- [ ] **Step 2: Rodar testes (devem falhar)**

```bash
npx vitest run lib/queries/purchases.test.ts
```

Esperado: erro de import.

- [ ] **Step 3: Implementar `lib/queries/purchases.ts`**

```typescript
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { whatsappGroupMembers } from "@/lib/schema/whatsapp";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

export interface BuyerRow {
  transactionId: string;
  purchasedAt: Date;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneE164: string | null;
  valueCents: number | null;
  /** true se está em algum grupo agora, false se está mas saiu, null se telefone faltou */
  inGroup: boolean | null;
}

/**
 * Retorna compradores aprovados de um produto dentro de um período.
 * Faz LEFT JOIN com whatsapp_group_members.phone_normalized pra resolver inGroup.
 * Se buyer_phone_e164 for null, inGroup = null (não rotula como "fora").
 */
export async function getBuyersForCycle(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<BuyerRow[]> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");

  const rows = await db
    .select({
      transactionId: purchases.transactionId,
      purchasedAt: purchases.purchasedAt,
      buyerName: purchases.buyerName,
      buyerEmail: purchases.buyerEmail,
      buyerPhoneE164: purchases.buyerPhoneE164,
      valueCents: purchases.valueCents,
      inGroupAny: sql<boolean | null>`
        case
          when ${purchases.buyerPhoneE164} is null then null
          else exists(
            select 1 from ${whatsappGroupMembers}
            where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
              and ${whatsappGroupMembers.currentlyInGroup} = true
          )
        end
      `,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    )
    .orderBy(sql`${purchases.purchasedAt} desc`);

  return rows.map((r) => ({
    transactionId: r.transactionId,
    purchasedAt: r.purchasedAt,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhoneE164: r.buyerPhoneE164,
    valueCents: r.valueCents,
    inGroup: r.inGroupAny,
  }));
}
```

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run lib/queries/purchases.test.ts
```

Esperado: 2 testes passando.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/purchases.ts lib/queries/purchases.test.ts
git commit -m "feat(purchases): query getBuyersForCycle com match no grupo"
```

### Task 5.2: Componente `BuyersTable`

**Files:**
- Create: `components/dashboard/buyers-table.tsx`

- [ ] **Step 1: Criar componente**

```typescript
import Link from "next/link";
import { Check, X, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "./format";
import type { BuyerRow } from "@/lib/queries/purchases";

interface Props {
  buyers: BuyerRow[];
  /** Mostra coluna "No grupo" (só faz sentido no /desafio) */
  showInGroup?: boolean;
}

function maskPhone(e164: string | null): string {
  if (!e164) return "—";
  // 5511987654321 → +55 11 9****-4321
  if (e164.length < 10) return e164;
  const cc = e164.slice(0, 2);
  const ddd = e164.slice(2, 4);
  const head = e164.slice(4, 5);
  const tail = e164.slice(-4);
  return `+${cc} ${ddd} ${head}****-${tail}`;
}

function whatsappLink(e164: string | null): string | null {
  return e164 ? `https://wa.me/${e164}` : null;
}

export function BuyersTable({ buyers, showInGroup = false }: Props) {
  if (buyers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum comprador aprovado no período.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          {showInGroup && <TableHead className="text-center">No grupo</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {buyers.map((b) => {
          const link = whatsappLink(b.buyerPhoneE164);
          return (
            <TableRow key={b.transactionId}>
              <TableCell className="tabular-nums text-sm">
                {fmt.shortDate(b.purchasedAt.toISOString().slice(0, 10))}
              </TableCell>
              <TableCell className="font-medium">{b.buyerName ?? "—"}</TableCell>
              <TableCell>
                {link ? (
                  <Link href={link} target="_blank" className="text-primary hover:underline">
                    {maskPhone(b.buyerPhoneE164)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {b.valueCents != null ? fmt.money(b.valueCents / 100) : "—"}
              </TableCell>
              {showInGroup && (
                <TableCell className="text-center">
                  {b.inGroup === true ? (
                    <Check className="inline h-4 w-4 text-emerald-500" />
                  ) : b.inGroup === false ? (
                    <X className="inline h-4 w-4 text-rose-500" />
                  ) : (
                    <Minus className="inline h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/buyers-table.tsx
git commit -m "feat(buyers): componente BuyersTable"
```

### Task 5.3: Integrar `BuyersTable` no /desafio e /guia

**Files:**
- Modify: `app/(dashboard)/desafio/page.tsx`
- Modify: `app/(dashboard)/guia/page.tsx`

- [ ] **Step 1: /desafio — adicionar fetch e card**

Editar `app/(dashboard)/desafio/page.tsx`:

Adicionar imports no topo:

```typescript
import { getBuyersForCycle } from "@/lib/queries/purchases";
import { BuyersTable } from "@/components/dashboard/buyers-table";
```

No `Promise.all`, adicionar `getBuyersForCycle("desafio", currentRange)` e variável `buyers`:

```typescript
const [kpis, prevKpis, overlay, funnel, adsTbl, whatsapp, buyers] = await Promise.all([
  getKpis("desafio", currentRange),
  getKpis("desafio", prevRange),
  getCycleOverlay("desafio", { cycleDays, cyclesBack: CYCLES_BACK, custom }),
  getFunnelMetrics("desafio", currentRange),
  getHierarchyTable("desafio", currentRange, "ad"),
  getWhatsappSummary("desafio", currentRange),
  getBuyersForCycle("desafio", currentRange),
]);
```

Adicionar card **entre** o `<section>` de Tráfego/Criativos e o card de "Grupos WhatsApp":

```tsx
<Card className="bg-card border-border/60 mb-6">
  <CardHeader>
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Compradores do período · {buyers.length}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <BuyersTable buyers={buyers} showInGroup />
  </CardContent>
</Card>
```

- [ ] **Step 2: /guia — adicionar fetch e card (sem `showInGroup`)**

Editar `app/(dashboard)/guia/page.tsx`:

Adicionar imports:

```typescript
import { getBuyersForCycle } from "@/lib/queries/purchases";
import { BuyersTable } from "@/components/dashboard/buyers-table";
```

`Promise.all`:

```typescript
const [kpis, prevKpis, overlay, funnel, adsTbl, buyers] = await Promise.all([
  getKpis("guia", currentRange),
  getKpis("guia", prevRange),
  getCycleOverlay("guia", { cycleDays, cyclesBack: CYCLES_BACK, custom }),
  getFunnelMetrics("guia", currentRange),
  getHierarchyTable("guia", currentRange, "ad"),
  getBuyersForCycle("guia", currentRange),
]);
```

Adicionar card no final do return, após o último `</section>`:

```tsx
<Card className="bg-card border-border/60 mb-6">
  <CardHeader>
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Compradores do período · {buyers.length}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <BuyersTable buyers={buyers} />
  </CardContent>
</Card>
```

- [ ] **Step 3: Verificar build**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 4: Rodar dev e validar UI**

```bash
npm run dev
```

Abrir `/desafio` — esperado: card "Compradores do período · N" com tabela (vazia até Hotmart enviar dados). Sem erros no console.

Abrir `/guia` — mesmo, sem coluna "No grupo".

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/desafio/page.tsx app/\(dashboard\)/guia/page.tsx
git commit -m "feat(desafio,guia): adiciona tabela de compradores com match no grupo"
```

### Task 5.4: Atualizar CLAUDE.md com estado final

- [ ] **Step 1: Editar `CLAUDE.md`**

Substituir seção "Estado atual (2026-05-16)" por "Estado atual (2026-05-17)" e:
- mover "Hotmart webhook" e "Poda + foco Desafio/Guia" pra "Concluído"
- remover tudo de "Pendências imediatas" que ficou obsoleto (Mini-Fase 3.5, Fase 4 SendFlow se já estiver pronto, Instagram setup)
- nova pendência: "Bruno cadastrar Hotmart webhook no painel da Hotmart e setar `HOTTOK` na Vercel"

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: atualiza estado pós-poda + foco Desafio/Guia"
```

---

## Verificação final

- [ ] **Rodar suite completa de testes**

```bash
npm test
```

Esperado: tudo verde.

- [ ] **Type-check completo**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Lint**

```bash
npm run lint
```

Esperado: 0 erros.

- [ ] **Build de produção**

```bash
npm run build
```

Esperado: build OK, rotas listadas devem ser só: `/`, `/desafio`, `/guia`, `/login`, `/settings/*`, `/api/webhooks/sendflow`, `/api/webhooks/hotmart`, `/api/sync/*`, `/api/meta/*`, `/api/health`.

- [ ] **Push e validar deploy na Vercel**

```bash
git push origin main
```

Esperado: deploy verde. Bruno seta `HOTTOK` no painel da Vercel + cadastra webhook no Hotmart pra ativar coleta.
