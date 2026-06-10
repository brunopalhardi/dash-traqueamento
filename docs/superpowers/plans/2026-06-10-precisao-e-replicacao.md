# Precisão de Dados + Preparação pra Replicação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir as 4 causas-raiz de números imprecisos no dashboard (timezone UTC, atribuição regex→LIKE divergente, ROAS de fontes misturadas, sync parcial fingindo sucesso) e centralizar a config de cliente pra viabilizar clonagem pra outros 3 clientes.

**Architecture:** As correções são incrementais sobre o código existente — nada de reescrita. (1) Helpers de range passam a delegar pro `lib/utils/date-ranges.ts` (que já é timezone-correto). (2) A atribuição campanha→produto passa a ser **persistida** numa coluna `campaigns.product_slug` no momento do sync, eliminando a re-derivação por regex→LIKE em cada query. (3) A Visão Geral passa a usar receita Hotmart (fonte da verdade) no ROAS. (4) Sync ganha status `partial` e um cron semanal com janela de 28 dias pra recapturar atribuição retroativa do Meta. (5) Tudo que é específico do cliente (produtos, marca, contas Meta) vai pra um único `lib/client-config.ts`.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Supabase Postgres, Vitest, Vercel (crons).

**Contexto da auditoria (2026-06-10):** ver conversa de auditoria. Resumo das 4 causas-raiz:
1. `lib/queries/dashboard.ts:511-545` usa `new Date().toISOString()` (UTC) — depois das 21h BR o "hoje" vira amanhã; a receita Hotmart já é consultada em fuso BR (`inRangeBR`), então gasto e receita usam janelas deslocadas.
2. `extractAlternationTokens()` (duplicada em `dashboard.ts:148` e `funnel.ts:16`) converte `GUIA.*OBA` no literal `"GUIA  OBA"` → `LIKE` que nunca casa; diverge do `detectProduct()` que usa a regex de verdade.
3. Página Geral calcula ROAS com receita do **pixel Meta**; páginas Desafio/Guia usam receita **Hotmart**. Números contraditórios entre telas.
4. `syncMeta.ts:497-499`: job com 1 conta falhada fica `status="done"`; janela diária `last_7d` nunca recaptura reatribuição do Meta além de 7 dias.

---

## ⚠️ Regras do projeto (NÃO pular)

- **NUNCA rodar `npm run db:push`** — existem materialized views (`adset_insights_daily`, `campaign_insights_daily`) em prod que não estão no schema Drizzle; o push dropa as duas. Migrations SEMPRE via `npm run db:generate` + `npm run db:migrate`. (Pendência documentada no CLAUDE.md do projeto.)
- Testes (`npm test`) rodam contra o banco do `.env.local` (vitest carrega dotenv). Os testes novos deste plano são puros (sem DB), mas a suíte existente (`purchases.test.ts` etc.) toca o banco.
- Idioma de comentários/commits: PT-BR, seguindo o padrão do código existente.
- Branch: criar `fix/precisao-e-replicacao` antes do primeiro commit (`git checkout -b fix/precisao-e-replicacao`). Nunca commitar direto na main.

---

## File Structure (visão geral do que muda)

```
lib/utils/date-ranges.ts        # ganha addDays/diffDays exportados + rangeLastDays/rangePreviousPeriod BR
lib/utils/date-ranges.test.ts   # NOVO — testes puros dos ranges
lib/queries/dashboard.ts        # helpers de range viram delegação; productScopeWhere vem do shared
lib/queries/funnel.ts           # productScopeWhere vem do shared; deleta duplicação
lib/queries/product-scope.ts    # NOVO — filtro único por campaigns.product_slug
lib/products.ts                 # interface ganha campos de visual/nav; dados saem pro client-config
lib/products.test.ts            # NOVO — testes do detectProduct
lib/client-config.ts            # NOVO — TUDO específico do cliente num lugar só
lib/schema/meta.ts              # campaigns ganha product_slug + índice
lib/schema/sync.ts              # enum sync_job_status ganha "partial"
lib/meta/types.ts               # DatePreset ganha "last_28d"
lib/sync/syncMeta.ts            # grava product_slug no upsert; status partial; modo weekly
app/api/sync/refresh/route.ts   # parseMode aceita "weekly"
app/api/sync/refresh-weekly/route.ts  # NOVO — rota do cron semanal
app/(dashboard)/page.tsx        # ROAS com receita Hotmart; visual lido do client-config
components/dashboard/sidebar.tsx # brand + nav lidos do client-config; status partial
app/(dashboard)/settings/integrations/_components/last-sync.tsx  # badge partial
scripts/backfill-product-slug.ts # NOVO — popula product_slug nas campanhas existentes
vercel.json                     # cron semanal
.env.example                    # completa as 7 vars não documentadas
drizzle/0015_*.sql, 0016_*.sql  # migrations geradas
```

---

### Task 1: Ranges em fuso BR (mata o off-by-one depois das 21h)

A causa: `dashboard.ts` tem helpers próprios em UTC (`todayISO`, `rangeLastDays`, `rangePreviousPeriod`, `rangeCurrentWeek`, `rangeCurrentCycle`, `rangePreviousCycle`), enquanto `lib/utils/date-ranges.ts` já tem a base correta (`todayBR()` via `Intl.DateTimeFormat` + aritmética em noon-UTC). A solução: implementar os ranges genéricos em `date-ranges.ts` (puros e testáveis, com `today` injetável) e fazer `dashboard.ts` delegar — sem mudar assinatura exportada, então as páginas não precisam mudar import.

**Files:**
- Modify: `lib/utils/date-ranges.ts`
- Create: `lib/utils/date-ranges.test.ts`
- Modify: `lib/queries/dashboard.ts:325-355` (helpers de ciclo) e `lib/queries/dashboard.ts:509-545` (helpers de range)
- Modify: `app/(dashboard)/page.tsx` (nenhuma mudança de import necessária — só conferir)

- [ ] **Step 1: Escrever os testes que vão falhar**

Criar `lib/utils/date-ranges.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  addDays,
  diffDays,
  rangeLastDays,
  rangePreviousPeriod,
} from "./date-ranges";

describe("addDays / diffDays", () => {
  it("soma e subtrai cruzando mês", () => {
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
  });
  it("diffDays é inteiro exato", () => {
    expect(diffDays("2026-06-04", "2026-06-10")).toBe(6);
    expect(diffDays("2026-06-10", "2026-06-10")).toBe(0);
  });
});

describe("rangeLastDays", () => {
  it("últimos 7 dias terminando no today injetado", () => {
    expect(rangeLastDays(7, "2026-06-10")).toEqual({ from: "2026-06-04", to: "2026-06-10" });
  });
  it("1 dia = from == to", () => {
    expect(rangeLastDays(1, "2026-06-10")).toEqual({ from: "2026-06-10", to: "2026-06-10" });
  });
  it("cruza virada de mês sem off-by-one", () => {
    expect(rangeLastDays(7, "2026-06-03")).toEqual({ from: "2026-05-28", to: "2026-06-03" });
  });
});

describe("rangePreviousPeriod", () => {
  it("janela anterior de mesmo tamanho, sem overlap", () => {
    expect(rangePreviousPeriod({ from: "2026-06-04", to: "2026-06-10" })).toEqual({
      from: "2026-05-28",
      to: "2026-06-03",
    });
  });
  it("range de 1 dia → dia anterior", () => {
    expect(rangePreviousPeriod({ from: "2026-06-10", to: "2026-06-10" })).toEqual({
      from: "2026-06-09",
      to: "2026-06-09",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- lib/utils/date-ranges.test.ts`
Expected: FAIL — `addDays`, `diffDays`, `rangeLastDays`, `rangePreviousPeriod` não são exportados de `./date-ranges`.

- [ ] **Step 3: Implementar em `lib/utils/date-ranges.ts`**

Trocar a função privada `addDays` por export, e adicionar `diffDays`, `rangeLastDays`, `rangePreviousPeriod` (depois do bloco do `toISO`, antes de `thisWeek`):

```ts
/** Soma n dias a uma data ISO (n pode ser negativo). */
export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Diferença em dias inteiros entre duas datas ISO (to - from). */
export function diffDays(fromISO: string, toISO_: string): number {
  return Math.round((parseISO(toISO_).getTime() - parseISO(fromISO).getTime()) / 86_400_000);
}

/** Últimos N dias terminando hoje (fuso BR). `today` injetável pra teste. */
export function rangeLastDays(days: number, today = todayBR()): DateRange {
  return { from: addDays(today, -(days - 1)), to: today };
}

/** Período imediatamente anterior, de mesmo tamanho, sem overlap. */
export function rangePreviousPeriod(range: DateRange): DateRange {
  const days = diffDays(range.from, range.to) + 1;
  const prevTo = addDays(range.from, -1);
  return { from: addDays(prevTo, -(days - 1)), to: prevTo };
}
```

Nota: já existe `function addDays` privada no arquivo — é a MESMA implementação, só adicionar `export` nela e não duplicar.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/utils/date-ranges.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Fazer `lib/queries/dashboard.ts` delegar**

No topo do arquivo, adicionar o import (`import type` não serve — são valores):

```ts
import {
  todayBR,
  addDays as addDaysISO,
  rangeLastDays as rangeLastDaysBR,
  rangePreviousPeriod as rangePreviousPeriodBR,
} from "@/lib/utils/date-ranges";
```

(Não há ciclo em runtime: `date-ranges.ts` só importa o **type** `DateRange` de `dashboard.ts`, que é apagado na compilação.)

Substituir o bloco de helpers no fim do arquivo (linhas ~509-545, do comentário `// Helpers de range de datas (timezone SP simplificado)` até o fim de `rangeCurrentWeek`) por:

```ts
/* ─────────────────────────────────────────────────────────────────────── */
// Helpers de range — delegam pro lib/utils/date-ranges (fuso BR correto).

export function todayISO(): string {
  return todayBR();
}

export function rangeLastDays(days: number): DateRange {
  return rangeLastDaysBR(days);
}

export function rangePreviousPeriod(range: DateRange): DateRange {
  return rangePreviousPeriodBR(range);
}
```

`rangeCurrentWeek` deve ser DELETADA — confirmar antes que ninguém usa:

Run: `grep -rn "rangeCurrentWeek" app/ components/ lib/ scripts/ --include="*.ts" --include="*.tsx"`
Expected: só a própria definição em `dashboard.ts`. Se aparecer uso em outro lugar, manter e delegar pra `thisWeek()` de date-ranges em vez de deletar.

- [ ] **Step 6: Corrigir os helpers de ciclo (`rangeCurrentCycle` / `rangePreviousCycle`)**

Em `lib/queries/dashboard.ts:332-355`, substituir as duas funções:

```ts
/**
 * Range "ciclo atual" = últimos `cycleDays` dias terminando hoje (fuso BR).
 * Se `customStart`+`customEnd` forem passados, ignora cycleDays e usa o intervalo direto.
 */
export function rangeCurrentCycle(
  cycleDays: number,
  custom?: { start: string; end: string },
): DateRange {
  if (custom) return { from: custom.start, to: custom.end };
  const today = todayBR();
  return { from: addDaysISO(today, -(cycleDays - 1)), to: today };
}

/** Range do ciclo anterior (de mesmo tamanho) ao atual. */
export function rangePreviousCycle(currentRange: DateRange): DateRange {
  return rangePreviousPeriodBR(currentRange);
}
```

- [ ] **Step 7: Blindar os parses locais restantes**

Ainda em `dashboard.ts`, procurar todos os parses no padrão perigoso:

Run: `grep -n 'T00:00:00"' lib/queries/dashboard.ts`

Para cada ocorrência (ex.: dentro de `getCycleOverlay`), trocar `new Date(x + "T00:00:00")` por `new Date(x + "T12:00:00Z")` — noon UTC cai sempre no mesmo dia BR, independente do fuso da máquina. As funções locais `dateISO(d)`/`addDays(d: Date, n)` que operam sobre esses Date podem ficar como estão (com noon-UTC de base, `toISOString().slice(0,10)` devolve o dia certo).

- [ ] **Step 8: Typecheck + suíte completa**

Run: `npx tsc --noEmit && npm test`
Expected: zero erros de tipo; todos os testes passam (os de DB exigem `.env.local` válido — se falharem por conexão, anotar e seguir; não são afetados por esta task).

- [ ] **Step 9: Commit**

```bash
git add lib/utils/date-ranges.ts lib/utils/date-ranges.test.ts lib/queries/dashboard.ts
git commit -m "fix: ranges de data em fuso BR — mata off-by-one apos 21h (server UTC)"
```

---

### Task 2: Atribuição de produto persistida no sync

Mata a classe de bug regex→LIKE: a coluna `campaigns.product_slug` passa a ser escrita pelo sync usando `detectProduct()` (a regex de verdade), e TODAS as queries filtram pela coluna. Fonte única de atribuição.

**Files:**
- Modify: `lib/schema/meta.ts:45-71` (tabela campaigns)
- Create: migration via `npm run db:generate` (vira `drizzle/0015_*.sql`)
- Modify: `lib/sync/syncMeta.ts:218-245` (upsert de campanhas)
- Create: `lib/queries/product-scope.ts`
- Modify: `lib/queries/dashboard.ts` (deletar `productScopeWhere` + `extractAlternationTokens` locais; `getProductBreakdown` usa a coluna)
- Modify: `lib/queries/funnel.ts:14-42` (idem)
- Create: `scripts/backfill-product-slug.ts`
- Create: `lib/products.test.ts`

- [ ] **Step 1: Testes do `detectProduct` (comportamento que vira fonte única)**

Criar `lib/products.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectProduct } from "./products";

const ACCT_GUIA = "act_972744231680763";
const ACCT_DESAFIO = "act_1394993860878989";

describe("detectProduct", () => {
  it("campanhas PERPETUO-GA são guia", () => {
    expect(detectProduct("B-PERPETUO-GA-GRUPO-EXAUSTÃO-A", ACCT_GUIA)).toBe("guia");
  });
  it("remarketing PERPETUO-GUIA é guia", () => {
    expect(detectProduct("B-PERPETUO-GUIA-F-Remarketing Checkout", ACCT_GUIA)).toBe("guia");
  });
  it("GUIA.*OBA casa com separadores no meio (caso que o LIKE antigo perdia)", () => {
    expect(detectProduct("GUIA-NOVO-OBA", ACCT_GUIA)).toBe("guia");
  });
  it("post impulsionado [C1] NÃO é guia (cai em outros)", () => {
    expect(detectProduct("[C1] Post do Instagram: cuidador", ACCT_GUIA)).toBe("outros");
  });
  it("VENDAS-DESAFIO na conta de lançamentos é desafio", () => {
    expect(detectProduct("B-VENDAS-DESAFIO-F-LP1", ACCT_DESAFIO)).toBe("desafio");
  });
  it("nome de desafio na conta errada não atribui", () => {
    expect(detectProduct("B-VENDAS-DESAFIO-F-LP1", ACCT_GUIA)).toBe("outros");
  });
});
```

Run: `npm test -- lib/products.test.ts`
Expected: PASS direto (o `detectProduct` já existe e está correto — os testes blindam o contrato antes da migração de atribuição).

- [ ] **Step 2: Adicionar coluna no schema Drizzle**

Em `lib/schema/meta.ts`, na tabela `campaigns`, depois de `status: text("status").notNull(),`:

```ts
    /**
     * Slug do produto detectado no sync via detectProduct() — fonte única
     * de atribuição campanha→produto. "outros" = não categorizado.
     */
    productSlug: text("product_slug"),
```

E no array de índices da tabela (terceiro argumento), adicionar:

```ts
    index("campaigns_product_slug_idx").on(t.productSlug),
```

- [ ] **Step 3: Gerar e aplicar migration (NUNCA db:push)**

Run: `npm run db:generate -- --name campaign_product_slug`
Expected: novo arquivo `drizzle/0015_campaign_product_slug.sql` contendo:

```sql
ALTER TABLE "campaigns" ADD COLUMN "product_slug" text;
CREATE INDEX "campaigns_product_slug_idx" ON "campaigns" USING btree ("product_slug");
```

Conferir que o SQL gerado tem SÓ isso (se o drizzle tentar dropar/alterar qualquer outra coisa — especialmente views — PARAR e investigar antes de aplicar).

Run: `npm run db:migrate`
Expected: migration aplicada sem erro.

- [ ] **Step 4: Gravar o slug no upsert do sync**

Em `lib/sync/syncMeta.ts`:

1. Adicionar import no topo: `import { detectProduct } from "@/lib/products";`
2. No loop de campanhas (linha ~218, `for (const c of apiCampaigns)`), adicionar `productSlug` tanto no `values` quanto no `set` do `onConflictDoUpdate`. Usar `actId` (a variável já normalizada com prefixo `act_` definida logo acima no loop de contas) — NÃO `account.metaAccountId`, que pode vir sem prefixo do banco:

```ts
          .values({
            adAccountId: account.id,
            metaId: c.id,
            name: c.name,
            objective: c.objective,
            status: c.status,
            productSlug: detectProduct(c.name, actId),
            dailyBudget: c.daily_budget ?? null,
            lifetimeBudget: c.lifetime_budget ?? null,
            startTime: c.start_time ? new Date(c.start_time) : null,
            stopTime: c.stop_time ? new Date(c.stop_time) : null,
          })
          .onConflictDoUpdate({
            target: campaigns.metaId,
            set: {
              name: c.name,
              objective: c.objective,
              status: c.status,
              productSlug: detectProduct(c.name, actId),
              dailyBudget: c.daily_budget ?? null,
              lifetimeBudget: c.lifetime_budget ?? null,
              startTime: c.start_time ? new Date(c.start_time) : null,
              stopTime: c.stop_time ? new Date(c.stop_time) : null,
              updatedAt: new Date(),
            },
          });
```

- [ ] **Step 5: Script de backfill das campanhas existentes**

Criar `scripts/backfill-product-slug.ts` (mesmo boilerplate dos `diag-*.ts`):

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { campaigns, adAccounts } from "@/lib/schema/meta";
import { detectProduct } from "@/lib/products";
import { eq } from "drizzle-orm";

(async () => {
  const rows = await db
    .select({ id: campaigns.id, name: campaigns.name, acct: adAccounts.metaAccountId })
    .from(campaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId));

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const actId = r.acct.startsWith("act_") ? r.acct : `act_${r.acct}`;
    const slug = detectProduct(r.name, actId);
    await db.update(campaigns).set({ productSlug: slug }).where(eq(campaigns.id, r.id));
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  console.log("backfill ok:", counts);
  process.exit(0);
})();
```

Run: `npx tsx scripts/backfill-product-slug.ts`
Expected: saída tipo `backfill ok: { guia: N, desafio: M, outros: K }` com K pequeno (posts [C1] e similares). Se `outros` for inesperadamente grande, listar os nomes e conferir os regex em `lib/client-config.ts`/`lib/products.ts` antes de seguir.

- [ ] **Step 6: Criar o filtro compartilhado**

Criar `lib/queries/product-scope.ts`:

```ts
import { eq, type SQL } from "drizzle-orm";
import { campaigns } from "@/lib/schema";
import type { Product } from "@/lib/products";

/**
 * Filtro de produto pra queries de insights.
 * A atribuição é persistida em campaigns.product_slug pelo sync (detectProduct)
 * — fonte única; nada de re-derivar regex em LIKE por query.
 */
export function productScopeWhere(product: Product): SQL[] {
  if (product.slug === "geral") return [];
  return [eq(campaigns.productSlug, product.slug)];
}
```

- [ ] **Step 7: Trocar nos dois consumers e deletar a duplicação**

Em `lib/queries/dashboard.ts`:
1. Deletar as funções locais `productScopeWhere` (linhas ~128-145) e `extractAlternationTokens` (linhas ~147-155).
2. Adicionar import: `import { productScopeWhere } from "./product-scope";`
3. Conferir imports órfãos: se `like` e `or` do drizzle-orm não forem mais usados no arquivo, remover do import.

Em `lib/queries/funnel.ts`:
1. Deletar o bloco inteiro `/* ─── product scope (replicado de dashboard.ts ...) ── */` (linhas ~14-42, as duas funções).
2. Adicionar import: `import { productScopeWhere } from "./product-scope";`
3. Remover `like`/`or` do import drizzle se ficarem órfãos. O `eq` continua usado.

- [ ] **Step 8: `getProductBreakdown` passa a agrupar pela coluna**

Em `lib/queries/dashboard.ts` (~linha 254), substituir a query e a classificação em memória. A query atual agrupa por `campaigns.name + adAccounts.metaAccountId` e roda `detectProduct` por linha; a nova agrupa direto pela coluna:

```ts
export async function getProductBreakdown(range: DateRange): Promise<ProductBreakdownRow[]> {
  const rows = await db
    .select({
      productSlug: campaigns.productSlug,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .where(and(gte(adInsightsDaily.date, range.from), lte(adInsightsDaily.date, range.to)))
    .groupBy(campaigns.productSlug);

  const labelOf = (slug: ProductSlug | "outros") =>
    slug === "outros"
      ? "Outros"
      : PRODUCTS.find((p) => p.slug === slug)?.shortLabel ?? slug;

  const out: ProductBreakdownRow[] = [];
  for (const r of rows) {
    const slug = (r.productSlug ?? "outros") as ProductSlug | "outros";
    // comportamento atual preservado: outros/geral ficam fora do breakdown
    if (slug === "geral" || slug === "outros") continue;
    out.push({
      productSlug: slug,
      label: labelOf(slug),
      spend: Number(r.spend),
      leads: Number(r.leads),
      purchases: Number(r.purchases),
      revenue: Number(r.revenue),
      roas: divSafe(Number(r.revenue), Number(r.spend)),
    });
  }
  return out.sort((a, b) => b.spend - a.spend);
}
```

O join com `adAccounts` saiu (não é mais necessário). Se `adAccounts` ficar órfão nos imports do arquivo, conferir os outros usos antes de remover (o `getKpis` ainda usa).

- [ ] **Step 9: Validação cruzada — números antes vs depois**

O diag existente compara gasto por regex direto no banco:

Run: `npx tsx scripts/diag-guia-spend.ts`

Comparar o gasto do Guia reportado pelo diag (que usa a regex verdadeira) com o que a query nova retorna. Devem bater AGORA (o LIKE antigo podia perder campanha; a coluna não perde). Se houver diferença, investigar quais campanhas têm `product_slug` divergente antes de seguir.

- [ ] **Step 10: Typecheck + testes + commit**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

```bash
git add lib/schema/meta.ts drizzle/ lib/sync/syncMeta.ts lib/queries/product-scope.ts lib/queries/dashboard.ts lib/queries/funnel.ts scripts/backfill-product-slug.ts lib/products.test.ts
git commit -m "fix: atribuicao campanha->produto persistida no sync (campaigns.product_slug) — mata divergencia regex vs LIKE"
```

---

### Task 3: ROAS da Visão Geral com receita Hotmart

A Geral hoje mostra ROAS = receita pixel ÷ gasto. As páginas Desafio/Guia usam receita Hotmart. Padronizar: **Hotmart é a fonte da verdade de receita**; o pixel vira informação secundária rotulada.

**Files:**
- Modify: `app/(dashboard)/page.tsx`

- [ ] **Step 1: Buscar receita Hotmart no server component**

Em `app/(dashboard)/page.tsx`, adicionar imports:

```ts
import { getApprovedPurchaseRevenue } from "@/lib/queries/purchases";
import { PRODUCTS, type ProductSlug } from "@/lib/products";
```

(o import de `ProductSlug` já existe — só juntar `PRODUCTS` nele.)

Dentro de `GeralPage`, depois do `Promise.all` existente (linha ~76-81), adicionar:

```ts
  // Receita Hotmart (fonte da verdade) — soma dos produtos com venda
  const salesProducts = PRODUCTS.filter((p) => p.slug !== "geral");
  const [hotCurr, hotPrev] = await Promise.all([
    Promise.all(salesProducts.map((p) => getApprovedPurchaseRevenue(p.slug, range))),
    Promise.all(salesProducts.map((p) => getApprovedPurchaseRevenue(p.slug, prevRange))),
  ]);
  const hotBySlug: Record<string, number> = {};
  salesProducts.forEach((p, i) => (hotBySlug[p.slug] = hotCurr[i]));
  const revenueHot = hotCurr.reduce((a, b) => a + b, 0);
  const prevRevenueHot = hotPrev.reduce((a, b) => a + b, 0);
  const roasReal = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const prevRoasReal = prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;
```

(Sequencial após o primeiro `Promise.all` é aceitável — são 4 queries leves. Não otimizar agora.)

- [ ] **Step 2: Trocar os KPI cards**

Substituir o card "Receita (Pixel)" (linhas ~102-106):

```tsx
        <KpiCard
          label="Receita (Hotmart)"
          value={fmt.money(revenueHot)}
          delta={deltaFromKpis(revenueHot, prevRevenueHot)}
          hint={`pixel meta: ${fmt.money(kpis.revenue)}`}
        />
```

Substituir o card ROAS (linhas ~107-121):

```tsx
        <KpiCard
          label="ROAS"
          value={fmt.ratio(roasReal)}
          delta={deltaFromKpis(roasReal, prevRoasReal)}
          hint={`receita Hotmart ÷ gasto Meta · vs ${fmt.ratio(prevRoasReal)} anterior`}
          tone={
            roasReal >= 2
              ? "good"
              : roasReal >= 1
                ? "warn"
                : roasReal > 0
                  ? "bad"
                  : "neutral"
          }
        />
```

Conferir se o componente `KpiCard` aceita prop `hint` (já é usada no ROAS atual — aceita).

- [ ] **Step 3: Header do gráfico e breakdown por produto**

No bloco de Stats acima do gráfico (linhas ~138-144), trocar:

```tsx
            <Stat label="Investimento total" value={fmt.money(kpis.spend)} />
            <Stat
              label="Receita Hotmart"
              value={fmt.money(revenueHot)}
              tone={revenueHot >= kpis.spend ? "good" : "bad"}
            />
            <Stat label="ROAS real" value={fmt.ratio(roasReal)} />
```

O gráfico diário continua com a série `revenue` do pixel (não existe série diária Hotmart consolidada aqui — fica como melhoria futura). Pra deixar claro, trocar o label da série no `ComboChart` de `"receita"` pra `"receita (pixel)"`.

No map do breakdown (linha ~192), depois de `const slug = p.productSlug;`, adicionar:

```tsx
            const hotRevenue = hotBySlug[slug] ?? 0;
            const roasHot = p.spend > 0 ? hotRevenue / p.spend : 0;
```

E trocar os dois Stats de Receita/ROAS do card (linhas ~233-242):

```tsx
                  <Stat
                    label="Receita (Hotmart)"
                    value={fmt.money(hotRevenue)}
                    tone={hotRevenue > 0 ? "good" : undefined}
                  />
                  <Stat
                    label="ROAS"
                    value={fmt.ratio(roasHot)}
                    valueClassName={roasTone}
                  />
```

E atualizar `roasTone` (linha ~197) pra usar `roasHot` em vez de `p.roas` (mesmos thresholds).

- [ ] **Step 4: Verificar visualmente**

Run: `npx tsc --noEmit && npm run dev`
Abrir `http://localhost:3000/` e conferir: card "Receita (Hotmart)" com hint do pixel; ROAS coerente com o que a página `/guia` mostra pro mesmo período (mesma fonte agora). Parar o dev server.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/page.tsx"
git commit -m "fix: visao geral usa receita Hotmart como fonte do ROAS — pixel vira metrica secundaria rotulada"
```

---

### Task 4: Sync honesto — status `partial` + re-sync semanal 28d

Duas mudanças: (a) job com falha parcial deixa de fingir `done`; (b) cron semanal re-sincroniza 28 dias pra capturar reatribuição retroativa do Meta (a janela de atribuição deles ajusta números de dias passados).

**Files:**
- Modify: `lib/schema/sync.ts:27-32` (enum)
- Create: migration via `npm run db:generate` (vira `drizzle/0016_*.sql`)
- Modify: `lib/meta/types.ts:149` (DatePreset)
- Modify: `lib/sync/syncMeta.ts` (SyncMode weekly + status partial)
- Modify: `app/api/sync/refresh/route.ts:18-22` (parseMode)
- Create: `app/api/sync/refresh-weekly/route.ts`
- Modify: `vercel.json`
- Modify: `components/dashboard/sidebar.tsx:37-93` (status partial)
- Modify: `app/(dashboard)/settings/integrations/_components/last-sync.tsx:25-27`

- [ ] **Step 1: Adicionar `partial` ao enum no schema**

Em `lib/schema/sync.ts`:

```ts
export const syncJobStatus = pgEnum("sync_job_status", [
  "queued",
  "running",
  "done",
  "partial",
  "failed",
]);
```

- [ ] **Step 2: Gerar e aplicar migration**

Run: `npm run db:generate -- --name sync_status_partial`
Expected: `drizzle/0016_sync_status_partial.sql` com:

```sql
ALTER TYPE "public"."sync_job_status" ADD VALUE 'partial' BEFORE 'failed';
```

Se o drizzle gerar qualquer coisa diferente de um `ALTER TYPE ... ADD VALUE` (ex.: recriar o enum com drop), DESCARTAR o arquivo gerado e escrever a migration manual com exatamente o SQL acima (criar o arquivo na pasta `drizzle/` seguindo a numeração e registrar no `drizzle/meta/_journal.json` no mesmo formato das entradas anteriores).

Run: `npm run db:migrate`
Expected: aplicada sem erro.

- [ ] **Step 3: DatePreset + modo weekly + status partial no syncMeta**

Em `lib/meta/types.ts:149`:

```ts
export type DatePreset = "yesterday" | "last_3d" | "last_7d" | "last_28d" | "last_30d";
```

(`last_28d` é um `date_preset` válido da Graph API.)

Em `lib/sync/syncMeta.ts`:

```ts
export type SyncMode = "backfill" | "daily" | "weekly" | "manual";

const MODE_TO_PRESET: Record<SyncMode, DatePreset> = {
  backfill: "last_30d",
  daily: "last_7d",
  // weekly recaptura a reatribuição retroativa do Meta (janela de até 28d)
  weekly: "last_28d",
  manual: "last_30d",
};
```

E no fim do arquivo (linha ~498), trocar o cálculo de status:

```ts
  const anyFailed = results.some((r) => r.error);
  const allFailed = results.length > 0 && results.every((r) => r.error);
  // partial = pelo menos 1 conta falhou mas não todas — antes fingia "done"
  const status: "done" | "failed" | "partial" = allFailed
    ? "failed"
    : anyFailed
      ? "partial"
      : "done";
```

Conferir o tipo de retorno de `syncMeta` (interface/inline no mesmo arquivo) — se declarar `status: "done" | "failed"`, ampliar pra incluir `"partial"`.

- [ ] **Step 4: Rotas — aceitar weekly + rota dedicada pro cron**

Em `app/api/sync/refresh/route.ts:18-22`:

```ts
function parseMode(req: NextRequest): SyncMode {
  const v = req.nextUrl.searchParams.get("mode");
  if (v === "backfill" || v === "manual" || v === "daily" || v === "weekly") return v;
  return "daily";
}
```

Criar `app/api/sync/refresh-weekly/route.ts` (rota dedicada — cron da Vercel chama path puro, sem depender de query string):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { syncMeta } from "@/lib/sync/syncMeta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-sync semanal com janela de 28 dias: o Meta reatribui conversões
// retroativamente, então dias "fechados" pelo daily (last_7d) ainda mudam.

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });
  }
  const client = createMetaClient({
    token,
    graphVersion: process.env.META_GRAPH_VERSION,
  });
  const result = await syncMeta({ mode: "weekly", client });
  return NextResponse.json(result);
}

export const GET = POST;
```

Em `vercel.json`, adicionar ao array `crons` (horários em UTC; `0 7 * * 1` = segunda 04h BR, antes do horário comercial e fora do daily das 02h):

```json
    {
      "path": "/api/sync/refresh-weekly",
      "schedule": "0 7 * * 1"
    }
```

- [ ] **Step 5: UI — mostrar partial**

Em `components/dashboard/sidebar.tsx`:

1. Tipo da prop (linha ~40): `status: "done" | "failed" | "running" | "partial";`
2. `syncTone` (linhas ~73-80) — partial é warn:

```ts
  const syncTone =
    lastSync?.status === "done"
      ? "good"
      : lastSync?.status === "running" || lastSync?.status === "partial"
        ? "warn"
        : lastSync?.status === "failed"
          ? "bad"
          : "warn";
```

3. `syncLabel` (linhas ~87-93):

```ts
  const syncLabel = !lastSync
    ? "sem sync"
    : lastSync.status === "done"
      ? `sync · ${formatSyncTime(lastSync.finishedAt)}`
      : lastSync.status === "partial"
        ? `sync parcial · ${formatSyncTime(lastSync.finishedAt)}`
        : lastSync.status === "running"
          ? "sincronizando…"
          : `falhou · ${formatSyncTime(lastSync.finishedAt)}`;
```

4. Conferir o layout que passa `lastSync` pra Sidebar (`app/(dashboard)/layout.tsx`): se ele tipar/filtrar o status, ampliar lá também (`grep -n "lastSync" app/\(dashboard\)/layout.tsx`).

Em `app/(dashboard)/settings/integrations/_components/last-sync.tsx:25`:

```tsx
              <Badge
                variant={
                  last.status === "done"
                    ? "default"
                    : last.status === "partial"
                      ? "secondary"
                      : "destructive"
                }
              >
                {last.status}
              </Badge>
```

- [ ] **Step 6: Typecheck + testes + sync manual de validação**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. (Existe `lib/sync/syncMeta.test.ts` — se ele assertar status `"done" | "failed"`, atualizar o teste pra cobrir o caso partial: 1 conta com erro + 1 ok → `"partial"`.)

- [ ] **Step 7: Commit**

```bash
git add lib/schema/sync.ts drizzle/ lib/meta/types.ts lib/sync/syncMeta.ts app/api/sync/refresh/route.ts app/api/sync/refresh-weekly/ vercel.json components/dashboard/sidebar.tsx "app/(dashboard)/settings/integrations/_components/last-sync.tsx"
git commit -m "fix: sync meta honesto — status partial quando conta falha + cron semanal 28d pra reatribuicao retroativa"
```

---

### Task 5: Config de cliente centralizada + `.env.example` completo

Prepara a clonagem pros 3 clientes: tudo que muda de cliente pra cliente vai pra UM arquivo (`lib/client-config.ts`). Clonar = editar esse arquivo + envs. Rotas dinâmicas por produto ficam FORA do escopo (ver follow-ups).

**Files:**
- Create: `lib/client-config.ts`
- Modify: `lib/products.ts`
- Modify: `components/dashboard/sidebar.tsx:23-35, 96-117`
- Modify: `app/(dashboard)/page.tsx:20-60` (PRODUCT_VISUAL/PRODUCT_DESC)
- Modify: `.env.example`
- Modify: `CLAUDE.md` (checklist de novo cliente)

- [ ] **Step 1: Estender a interface Product**

Em `lib/products.ts`, substituir a interface por:

```ts
export interface Product {
  slug: ProductSlug;
  label: string;
  shortLabel: string;
  description: string;
  /** ID Meta da conta de anúncios (formato `act_…`); null = todas */
  metaAccountId: string | null;
  /** Regex aplicada ao nome da campanha. null no "geral" = sem filtro */
  namePattern: RegExp | null;
  /** Cor accent (Tailwind class fragment, ex.: "violet-500") */
  accent: string;
  /** Default de período em dias (Desafio é tratado à parte) */
  defaultRangeDays: number;
  /** Rota do dashboard do produto; null = sem página própria */
  href: string | null;
  /** Tag visual na home (ex.: "PERPÉTUO") */
  tagLabel: string;
  /** Classes Tailwind do card na home */
  rail: string;
  tagBg: string;
  tagText: string;
  /** Badge no item do sidebar (ex.: ATIVO) */
  navBadge?: { text: string; tone: "good" | "warn" | "bad" };
  /** Aparece na navegação? (produto pausado = false) */
  showInNav: boolean;
  /** Produto tem grupo WhatsApp (coluna "no grupo", painel SendFlow)? */
  hasWhatsAppGroup: boolean;
}
```

- [ ] **Step 2: Criar `lib/client-config.ts`**

```ts
/**
 * ÚNICO arquivo a editar ao clonar o dashboard pra outro cliente
 * (além das env vars — ver .env.example).
 *
 * Tudo que é específico do negócio mora aqui: marca, produtos, contas Meta,
 * regex de nomenclatura de campanha, visual. O resto do código lê daqui
 * via lib/products.ts.
 */
import type { Product } from "@/lib/products";

/** Slugs dos produtos deste cliente. "geral" é obrigatório. */
export type ProductSlug = "geral" | "desafio" | "guia";

export const BRAND = {
  /** Iniciais no quadradinho do sidebar */
  initials: "OBA",
  name: "Traqueamento",
  subtitle: "tráfego pago + vendas",
};

export const CLIENT_PRODUCTS: Product[] = [
  {
    slug: "geral",
    label: "Geral",
    shortLabel: "Geral",
    description: "Visão consolidada de Desafio e Guia",
    metaAccountId: null,
    namePattern: null,
    accent: "violet-500",
    defaultRangeDays: 7,
    href: null,
    tagLabel: "GERAL",
    rail: "bg-muted-foreground/30",
    tagBg: "bg-muted",
    tagText: "text-muted-foreground",
    showInNav: false,
    hasWhatsAppGroup: false,
  },
  {
    slug: "desafio",
    label: "Desafio",
    shortLabel: "Desafio",
    description: "vendas do desafio semanal · ciclo seg→dom",
    metaAccountId: "act_1394993860878989",
    namePattern: /VENDAS-DESAFIO/i,
    accent: "fuchsia-500",
    defaultRangeDays: 7,
    href: "/desafio",
    tagLabel: "SEMANAL · DESATIVADO",
    rail: "bg-pink-500",
    tagBg: "bg-pink-500/15",
    tagText: "text-pink-300",
    showInNav: false, // produto pausado — some do sidebar, segue na home
    hasWhatsAppGroup: true,
  },
  {
    slug: "guia",
    label: "Guia",
    shortLabel: "Guia",
    description: "produto perpétuo · ticket maior",
    metaAccountId: "act_972744231680763",
    // Nomenclatura: campanhas do Guia usam prefixo PERPETUO-GA (GA = Guia do
    // Alzheimer), divididas por grupo (-GRUPO-EXAUSTÃO-*), mais remarketing
    // PERPETUO-GUIA-F-*. Posts [C1] do Instagram NÃO entram (caem em outros).
    namePattern: /PERPETUO-GA|PERPETUO-GUIA|GUIA.*OBA/i,
    accent: "amber-500",
    defaultRangeDays: 30,
    href: "/guia",
    tagLabel: "PERPÉTUO",
    rail: "bg-purple-500",
    tagBg: "bg-purple-500/15",
    tagText: "text-purple-300",
    navBadge: { text: "ATIVO", tone: "good" },
    showInNav: true,
    hasWhatsAppGroup: false,
  },
];
```

- [ ] **Step 3: `lib/products.ts` passa a ler do client-config**

Substituir o array `PRODUCTS` e o type:

```ts
import { CLIENT_PRODUCTS } from "@/lib/client-config";

export type { ProductSlug } from "@/lib/client-config";

// ... interface Product (Step 1) fica aqui ...

export const PRODUCTS: Product[] = CLIENT_PRODUCTS;
```

`getProduct`, `getDashboardProducts` e `detectProduct` ficam como estão. Atualizar o doc-comment do topo do arquivo: catálogo agora vive em `lib/client-config.ts`.

Nota de ciclo de import: `products.ts` importa **valor** de `client-config.ts`; `client-config.ts` importa só **type** de `products.ts` (apagado em runtime) — sem ciclo real. O type `ProductSlug` muda de dono (client-config) mas o re-export mantém todos os imports existentes funcionando.

Run: `npm test -- lib/products.test.ts`
Expected: PASS (mesmo comportamento, dados vindo do novo arquivo).

- [ ] **Step 4: Sidebar lê marca e nav do config**

Em `components/dashboard/sidebar.tsx`:

1. Imports: `import { BRAND } from "@/lib/client-config";` e `import { PRODUCTS } from "@/lib/products";`
2. Substituir `SECTIONS` (linhas ~23-35):

```ts
const SECTIONS: NavSection[] = [
  {
    title: "Dashboards",
    items: [
      { href: "/", label: "Visão Geral", icon: LayoutDashboard },
      ...PRODUCTS.filter((p) => p.showInNav && p.href).map((p) => ({
        href: p.href!,
        label: p.label,
        icon: BookOpen,
        badge: p.navBadge?.text,
        badgeTone: p.navBadge?.tone,
      })),
    ],
  },
  {
    title: "Sistema",
    items: [{ href: "/settings/integrations", label: "Integrações", icon: Settings }],
  },
];
```

3. No brand block (linhas ~107-115), trocar os 3 textos hardcoded:
   - `OBA` → `{BRAND.initials}`
   - `Traqueamento` → `{BRAND.name}`
   - `tráfego pago + vendas` → `{BRAND.subtitle}`

- [ ] **Step 5: Home lê visual do config**

Em `app/(dashboard)/page.tsx`, deletar os Records `PRODUCT_VISUAL` (linhas ~21-53) e `PRODUCT_DESC` (linhas ~55-60) e substituir por uma derivação + fallback:

```ts
const OUTROS_VISUAL = {
  rail: "bg-muted-foreground/30",
  tagBg: "bg-muted",
  tagText: "text-muted-foreground",
  tagLabel: "OUTROS",
  href: null as string | null,
  description: "campanhas não categorizadas",
};

function visualOf(slug: ProductSlug | "outros") {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) return OUTROS_VISUAL;
  return {
    rail: p.rail,
    tagBg: p.tagBg,
    tagText: p.tagText,
    tagLabel: p.tagLabel,
    href: p.href,
    description: p.description,
  };
}
```

No map do breakdown, trocar `const visual = PRODUCT_VISUAL[slug] ?? PRODUCT_VISUAL.outros;` por `const visual = visualOf(slug);` e `const desc = PRODUCT_DESC[slug] ?? "";` por `const desc = visual.description;`. O resto do JSX já usa `visual.rail/tagBg/tagText/tagLabel/href` — nomes batem, não muda nada. Remover o `const isDesafio = slug === "desafio";` e a classe `opacity-70` condicionada a ele? NÃO — manter comportamento; trocar a condição por `const dimmed = !visualOf(slug).href || !PRODUCTS.find((x) => x.slug === slug)?.showInNav;` é mudança de comportamento sutil demais. Manter `isDesafio` como está (vira follow-up).

- [ ] **Step 6: Completar `.env.example`**

Acrescentar ao final de `.env.example`:

```bash
# Hotmart — webhook (hottok do painel) + OAuth da API de histórico
HOTTOK=
HOTMART_CLIENT_ID=
HOTMART_CLIENT_SECRET=

# SendFlow — API key + token do webhook + whitelist de releases (csv de IDs)
SENDFLOW_TOKEN=
SENDFLOW_WEBHOOK_TOKEN=
SENDFLOW_RELEASE_IDS=

# Auth dos crons da Vercel (Authorization: Bearer <CRON_SECRET>)
CRON_SECRET=
```

- [ ] **Step 7: Checklist de novo cliente no CLAUDE.md**

Adicionar ao `CLAUDE.md` do projeto (depois da seção "Estado atual"):

```markdown
### Clonar pra novo cliente (estratégia atual: 1 repo fork + 1 Supabase por cliente)

1. Fork/clone do repo + novo projeto Vercel + novo Supabase (rodar migrations: `npm run db:migrate`)
2. Editar **`lib/client-config.ts`** (único arquivo de código): BRAND, produtos, contas Meta (`act_…`), regex de nomenclatura de campanha, rotas/visual
3. Criar as rotas de produto (`app/(dashboard)/<slug>/page.tsx`) espelhando `/guia` — ainda não são dinâmicas
4. Preencher TODAS as vars do `.env.example` na Vercel
5. Cadastrar webhooks no painel do cliente: Hotmart (`/api/webhooks/hotmart`, eventos PURCHASE_APPROVED/REFUNDED/CHARGEBACK) e SendFlow (`/api/webhooks/sendflow?token=…`)
6. Ativar contas Meta em `/settings/integrations` e rodar `/api/sync/refresh?mode=backfill`
7. Validar: gasto por produto vs Gerenciador de Anúncios, receita vs painel Hotmart, `scripts/diag-guia-spend.ts` adaptado
```

- [ ] **Step 8: Typecheck + suíte + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tudo verde. Build do Next sem erro (atenção a import cycle warnings — não deve haver).

- [ ] **Step 9: Commit**

```bash
git add lib/client-config.ts lib/products.ts components/dashboard/sidebar.tsx "app/(dashboard)/page.tsx" .env.example CLAUDE.md
git commit -m "refactor: config de cliente centralizada em lib/client-config.ts + .env.example completo — prepara clonagem"
```

---

## Verificação final (depois das 5 tasks)

- [ ] `npx tsc --noEmit && npm test && npm run build` — tudo verde
- [ ] Rodar `POST /api/sync/refresh?mode=manual` (logado) e conferir em `/settings/integrations` que o job termina `done` e que `campaigns.product_slug` está populado pras campanhas novas
- [ ] Comparar `/` (Geral) e `/guia` no MESMO período: receita e ROAS agora devem ser coerentes entre as duas telas
- [ ] Conferir às ~22h BR (ou simular mudando o relógio) que o "hoje" do dashboard não pula pro dia seguinte
- [ ] Deploy preview na Vercel antes de promover pra produção

## Fora do escopo (follow-ups conhecidos, NÃO implementar agora)

- Fila/queue pros webhooks Hotmart (risco de perda em timeout — relevante só em pico de lançamento)
- Ordenação por `occurredAt` nos eventos SendFlow fora de ordem
- Edge cases de telefone fixo com dígito 6/7 no E.164 (`lib/utils/phone.ts`)
- Rotas dinâmicas por produto (`app/(dashboard)/[product]/`) — fazer quando for clonar o 1º cliente
- Série diária de receita Hotmart no gráfico da Geral (hoje a linha é pixel)
- Multi-tenant de verdade (tenant_id + RLS) — só se virar SaaS com 5+ clientes
- Checkpoint per-table no sync Meta + alerta externo (e-mail/WhatsApp) em falha
- Migrar `Secret KEYs/tokens.md` pra um gerenciador de segredos
