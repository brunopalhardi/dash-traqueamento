import Link from "next/link";
import {
  getDailySeries,
  getKpis,
  getProductBreakdown,
  rangeLastDays,
  rangeLastFullDays,
  rangePreviousPeriod,
} from "@/lib/queries/dashboard";
import { RefreshTodayButton } from "@/components/dashboard/refresh-today-button";
import { ComboChart } from "@/components/dashboard/combo-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { getApprovedPurchaseRevenue, getRevenueSplit } from "@/lib/queries/purchases";
import { PRODUCTS, type ProductSlug } from "@/lib/products";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;

// Visual da categoria "outros" (campanhas não atribuídas a nenhum produto)
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

function deltaFromKpis(curr: number, prev: number) {
  return fmt.delta(curr, prev);
}

export default async function GeralPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; hoje?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number(sp.range ?? DEFAULT_DAYS)));
  // Dias COMPLETOS (termina ontem): o sync Meta nunca tem o dia corrente
  // fechado, e o "últimos 7 dias" do Gerenciador também termina ontem.
  // ?hoje=1 (botão "atualizar hoje") inclui o dia corrente, parcial.
  const includeToday = sp.hoje === "1";
  const range = includeToday ? rangeLastDays(days) : rangeLastFullDays(days);
  const prevRange = rangePreviousPeriod(range);

  const [kpis, prevKpis, daily, breakdown] = await Promise.all([
    getKpis("geral", range),
    getKpis("geral", prevRange),
    getDailySeries("geral", range),
    getProductBreakdown(range),
  ]);

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

  // Split de receita por balde de atribuição (tráfego/orgânico/sem atribuição)
  const splitArr = await Promise.all(
    salesProducts.map((p) => getRevenueSplit(p.slug, range)),
  );
  const split = splitArr.reduce(
    (acc, s) => ({
      trafego: acc.trafego + s.trafego,
      organico: acc.organico + s.organico,
      semAtribuicao: acc.semAtribuicao + s.semAtribuicao,
    }),
    { trafego: 0, organico: 0, semAtribuicao: 0 },
  );
  const roasTrafego = kpis.spend > 0 ? split.trafego / kpis.spend : 0;

  const hasData = daily.length > 0;
  const maxProductSpend = Math.max(...breakdown.map((b) => b.spend), 1);

  return (
    <>
      <PageHeader
        eyebrow="geral · consolidado"
        title="Visão Geral"
        subtitle={`últimos ${days} dias ${includeToday ? "· hoje parcial" : "completos (até ontem)"} · investimento e ROAS consolidados de todos os produtos`}
        rangeDays={DEFAULT_DAYS}
        right={<RefreshTodayButton />}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label="Investimento"
          value={fmt.money(kpis.spend)}
          delta={deltaFromKpis(kpis.spend, prevKpis.spend)}
          invertDelta
        />
        <KpiCard
          label="Receita (Hotmart)"
          value={fmt.money(revenueHot)}
          delta={deltaFromKpis(revenueHot, prevRevenueHot)}
          hint={`tráfego ${fmt.money(split.trafego)} · org ${fmt.money(split.organico)} · s/atrib ${fmt.money(split.semAtribuicao)}`}
        />
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
        <KpiCard
          label="ROAS (tráfego)"
          value={fmt.ratio(roasTrafego)}
          hint={`receita de tráfego ÷ gasto Meta · ROAS total ${fmt.ratio(roasReal)}`}
          tone={roasTrafego >= 2 ? "good" : roasTrafego >= 1 ? "warn" : roasTrafego > 0 ? "bad" : "neutral"}
        />
        <KpiCard
          label="Leads"
          value={fmt.int(kpis.leads)}
          delta={deltaFromKpis(kpis.leads, prevKpis.leads)}
        />
        <KpiCard
          label="CPL médio"
          value={fmt.money(kpis.cpl)}
          delta={deltaFromKpis(kpis.cpl, prevKpis.cpl)}
          invertDelta
        />
      </section>

      <div className="rounded-md border border-border bg-card p-6 mb-6">
        <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            <Stat label="Investimento total" value={fmt.money(kpis.spend)} />
            <Stat
              label="Receita Hotmart"
              value={fmt.money(revenueHot)}
              tone={revenueHot >= kpis.spend ? "good" : "bad"}
            />
            <Stat label="ROAS real" value={fmt.ratio(roasReal)} />
          </div>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
            investimento × receita / dia
          </div>
        </div>

        {hasData ? (
          <ComboChart
            data={daily}
            xKey="date"
            series={[
              {
                key: "spend",
                label: "investimento",
                type: "bar",
                color: "#6366f1",
                format: "money",
              },
              {
                key: "revenue",
                label: "receita (pixel)",
                type: "line",
                color: "#34d399",
                format: "money",
              },
            ]}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mb-1">
            por produto
          </div>
          <h2 className="text-lg font-medium tracking-tight">Breakdown do consolidado</h2>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhum gasto detectado por produto no período.
        </p>
      ) : (
        <section className="space-y-3">
          {breakdown.map((p) => {
            const slug = p.productSlug;
            const hotRevenue = hotBySlug[slug] ?? 0;
            const roasHot = p.spend > 0 ? hotRevenue / p.spend : 0;
            const visual = visualOf(slug);
            const desc = visual.description;
            const spendPct = Math.min(100, (p.spend / maxProductSpend) * 100);
            const roasTone =
              roasHot >= 2
                ? "text-emerald-400"
                : roasHot >= 1
                  ? "text-amber-400"
                  : roasHot > 0
                    ? "text-rose-400"
                    : "text-muted-foreground";
            const cardInner = (
              <article
                className={`relative rounded-md border border-border bg-card overflow-hidden transition-colors ${
                  visual.href ? "hover:border-border-hi cursor-pointer" : ""
                }`}
              >
                <div className={`absolute inset-y-0 left-0 w-[3px] ${visual.rail}`} />
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-6 pl-5 pr-5 py-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`font-mono text-[10px] tracking-[0.06em] font-medium px-1.5 py-0.5 rounded uppercase ${visual.tagBg} ${visual.tagText}`}
                      >
                        {visual.tagLabel}
                      </span>
                    </div>
                    <h3 className="font-medium text-lg leading-tight tracking-tight">
                      {p.label}
                    </h3>
                    <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mt-1">
                      {desc}
                    </div>
                  </div>
                  <Stat label="Investido" value={fmt.money(p.spend)} />
                  <Stat label="Vendas" value={fmt.int(p.purchases)} />
                  <Stat label="Leads" value={fmt.int(p.leads)} />
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
                </div>
                <div className="relative h-0.5 bg-muted/30">
                  <div
                    className={visual.rail}
                    style={{
                      width: `${spendPct}%`,
                      height: "100%",
                      opacity: 0.6,
                    }}
                  />
                </div>
              </article>
            );

            return visual.href ? (
              <Link key={slug} href={visual.href} className="block">
                {cardInner}
              </Link>
            ) : (
              <div key={slug}>{cardInner}</div>
            );
          })}
        </section>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  valueClassName,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  valueClassName?: string;
}) {
  const colorCls =
    valueClassName ??
    (tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : "");
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-medium">
        {label}
      </div>
      <div
        className={`font-mono font-medium tabular-nums text-[22px] leading-none tracking-tight mt-1.5 ${colorCls}`}
      >
        {value}
      </div>
    </div>
  );
}
