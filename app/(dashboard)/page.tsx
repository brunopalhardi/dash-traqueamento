import Link from "next/link";
import {
  getDailySeries,
  getKpis,
  getProductBreakdown,
  rangeLastDays,
  rangePreviousPeriod,
} from "@/lib/queries/dashboard";
import { ComboChart } from "@/components/dashboard/combo-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import type { ProductSlug } from "@/lib/products";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;

// Visual identity por produto na home
const PRODUCT_VISUAL: Record<
  ProductSlug | "outros",
  { rail: string; tagBg: string; tagText: string; tagLabel: string; href: string | null }
> = {
  geral: {
    rail: "bg-muted-foreground/30",
    tagBg: "bg-muted",
    tagText: "text-muted-foreground",
    tagLabel: "GERAL",
    href: null,
  },
  desafio: {
    rail: "bg-pink-500",
    tagBg: "bg-pink-500/15",
    tagText: "text-pink-300",
    tagLabel: "SEMANAL · DESATIVADO",
    href: "/desafio",
  },
  guia: {
    rail: "bg-purple-500",
    tagBg: "bg-purple-500/15",
    tagText: "text-purple-300",
    tagLabel: "PERPÉTUO",
    href: "/guia",
  },
  outros: {
    rail: "bg-muted-foreground/30",
    tagBg: "bg-muted",
    tagText: "text-muted-foreground",
    tagLabel: "OUTROS",
    href: null,
  },
};

const PRODUCT_DESC: Record<ProductSlug | "outros", string> = {
  geral: "consolidado",
  desafio: "vendas do desafio semanal · ciclo seg→dom",
  guia: "produto perpétuo · ticket maior",
  outros: "campanhas não categorizadas",
};

function deltaFromKpis(curr: number, prev: number) {
  return fmt.delta(curr, prev);
}

export default async function GeralPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number(sp.range ?? DEFAULT_DAYS)));
  const range = rangeLastDays(days);
  const prevRange = rangePreviousPeriod(range);

  const [kpis, prevKpis, daily, breakdown] = await Promise.all([
    getKpis("geral", range),
    getKpis("geral", prevRange),
    getDailySeries("geral", range),
    getProductBreakdown(range),
  ]);

  const hasData = daily.length > 0;
  const maxProductSpend = Math.max(...breakdown.map((b) => b.spend), 1);

  return (
    <>
      <PageHeader
        eyebrow="geral · consolidado"
        title="Visão Geral"
        subtitle={`últimos ${days} dias · investimento e ROAS consolidados de todos os produtos`}
        rangeDays={DEFAULT_DAYS}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Investimento"
          value={fmt.money(kpis.spend)}
          delta={deltaFromKpis(kpis.spend, prevKpis.spend)}
          invertDelta
        />
        <KpiCard
          label="Receita (Pixel)"
          value={fmt.money(kpis.revenue)}
          delta={deltaFromKpis(kpis.revenue, prevKpis.revenue)}
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(kpis.roas)}
          delta={deltaFromKpis(kpis.roas, prevKpis.roas)}
          hint={`vs ${fmt.ratio(prevKpis.roas)} anterior`}
          tone={
            kpis.roas >= 2
              ? "good"
              : kpis.roas >= 1
                ? "warn"
                : kpis.roas > 0
                  ? "bad"
                  : "neutral"
          }
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
              label="Receita total"
              value={fmt.money(kpis.revenue)}
              tone={kpis.revenue >= kpis.spend ? "good" : "bad"}
            />
            <Stat label="ROAS médio" value={fmt.ratio(kpis.roas)} />
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
                label: "receita",
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
            const visual = PRODUCT_VISUAL[slug] ?? PRODUCT_VISUAL.outros;
            const desc = PRODUCT_DESC[slug] ?? "";
            const spendPct = Math.min(100, (p.spend / maxProductSpend) * 100);
            const roasTone =
              p.roas >= 2
                ? "text-emerald-400"
                : p.roas >= 1
                  ? "text-amber-400"
                  : p.roas > 0
                    ? "text-rose-400"
                    : "text-muted-foreground";
            const isDesafio = slug === "desafio";

            const cardInner = (
              <article
                className={`relative rounded-md border border-border bg-card overflow-hidden transition-colors ${
                  visual.href ? "hover:border-border-hi cursor-pointer" : ""
                } ${isDesafio ? "opacity-70" : ""}`}
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
                    label="Receita"
                    value={fmt.money(p.revenue)}
                    tone={p.revenue > 0 ? "good" : undefined}
                  />
                  <Stat
                    label="ROAS"
                    value={fmt.ratio(p.roas)}
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
