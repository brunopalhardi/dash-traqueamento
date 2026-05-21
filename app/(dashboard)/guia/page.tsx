import { Activity, BookOpen, DollarSign, ShoppingCart, Target, TrendingUp } from "lucide-react";
import {
  getDailySeries,
  getKpis,
  getTopAds,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { parseRangeFromSearchParams } from "@/lib/utils/date-ranges";
import {
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getBuyersForCycle,
  getDailyPurchaseSeries,
} from "@/lib/queries/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyersTable } from "@/components/dashboard/buyers-table";
import { ComparisonToggle } from "@/components/dashboard/comparison-toggle";
import { DailyBarChart, type DailyBarPoint } from "@/components/dashboard/daily-bar-chart";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { TopCreativesGrid } from "@/components/dashboard/top-creatives-grid";
import type { DateRange, DailyPoint } from "@/lib/queries/dashboard";
import type { DailyPurchasePoint } from "@/lib/queries/purchases";

export const dynamic = "force-dynamic";


function buildDailyPoints(
  range: DateRange,
  hotmart: DailyPurchasePoint[],
  meta: DailyPoint[],
): DailyBarPoint[] {
  const out: DailyBarPoint[] = [];
  const start = new Date(range.from + "T12:00:00");
  const end = new Date(range.to + "T12:00:00");
  const cur = new Date(start);
  const hotmartMap = new Map(hotmart.map((d) => [d.date, d]));
  const metaMap = new Map(meta.map((d) => [d.date, d]));
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const h = hotmartMap.get(iso);
    const m = metaMap.get(iso);
    const vendas = h?.count ?? 0;
    const receita = h ? h.revenueCents / 100 : 0;
    const investido = m?.spend ?? 0;
    const roas = investido > 0 ? receita / investido : 0;
    out.push({ date: iso, vendas, receita, investido, roas });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function deltaOf(curr: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { label: "+∞", positive: curr > 0 };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

export default async function GuiaPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; cycle?: string; start?: string; end?: string; compare?: string }>;
}) {
  const sp = await searchParams;
  const { range: currentRange, label: rangeLabel } = parseRangeFromSearchParams(sp);
  const compare = sp.compare === "1";
  const prevRange = rangePreviousCycle(currentRange);

  const [
    kpis, adsTbl,
    purchaseCount, revenueHot, dailyHot, dailyMeta,
    prevKpis, prevPurchaseCount, prevRevenueHot, prevDailyHot, prevDailyMeta,
    buyers,
  ] = await Promise.all([
    getKpis("guia", currentRange),
    getTopAds("guia", currentRange, { limit: 5, orderBy: "spend" }),
    getApprovedPurchaseCount("guia", currentRange),
    getApprovedPurchaseRevenue("guia", currentRange),
    getDailyPurchaseSeries("guia", currentRange),
    getDailySeries("guia", currentRange),
    compare ? getKpis("guia", prevRange) : Promise.resolve(null),
    compare ? getApprovedPurchaseCount("guia", prevRange) : Promise.resolve(0),
    compare ? getApprovedPurchaseRevenue("guia", prevRange) : Promise.resolve(0),
    compare ? getDailyPurchaseSeries("guia", prevRange) : Promise.resolve([]),
    compare ? getDailySeries("guia", prevRange) : Promise.resolve([]),
    getBuyersForCycle("guia", currentRange),
  ]);

  const currentDaily = buildDailyPoints(currentRange, dailyHot, dailyMeta);
  const prevDaily = compare ? buildDailyPoints(prevRange, prevDailyHot, prevDailyMeta) : null;

  const cac = purchaseCount > 0 ? kpis.spend / purchaseCount : 0;
  const roas = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const ticketMedio = purchaseCount > 0 ? revenueHot / purchaseCount : 0;

  const prevCac = compare && prevPurchaseCount > 0 && prevKpis ? prevKpis.spend / prevPurchaseCount : 0;
  const prevRoas = compare && prevKpis && prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;
  const prevTicket = compare && prevPurchaseCount > 0 ? prevRevenueHot / prevPurchaseCount : 0;

  const subtitle = `${rangeLabel} · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}`;

  return (
    <>
      <PageHeader
        title="Guia"
        subtitle={subtitle}
        hidePicker
        right={
          <div className="flex items-center gap-2">
            <ComparisonToggle />
            <PeriodSelector />
          </div>
        }
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label="Investido"
          value={fmt.money(kpis.spend)}
          delta={compare && prevKpis ? deltaOf(kpis.spend, prevKpis.spend) : null}
          invertDelta
          icon={DollarSign}
          accent="violet"
        />
        <KpiCard
          label="Compradores"
          value={fmt.int(purchaseCount)}
          delta={compare ? deltaOf(purchaseCount, prevPurchaseCount) : null}
          icon={ShoppingCart}
          accent="emerald"
        />
        <KpiCard
          label="Receita"
          value={fmt.money(revenueHot)}
          delta={compare ? deltaOf(revenueHot, prevRevenueHot) : null}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="CAC"
          value={purchaseCount > 0 ? fmt.money(cac) : "—"}
          delta={compare && prevCac > 0 ? deltaOf(cac, prevCac) : null}
          invertDelta
          icon={Target}
          accent="amber"
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(roas)}
          hint="alvo 2x"
          delta={compare && prevRoas > 0 ? deltaOf(roas, prevRoas) : null}
          icon={Activity}
          accent="sky"
        />
        <KpiCard
          label="Ticket médio"
          value={purchaseCount > 0 ? fmt.money(ticketMedio) : "—"}
          delta={compare && prevTicket > 0 ? deltaOf(ticketMedio, prevTicket) : null}
          icon={BookOpen}
          accent="fuchsia"
        />
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Performance diária
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyBarChart current={currentDaily} previous={prevDaily} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Top criativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TopCreativesGrid ads={adsTbl} limit={5} basePath="/guia/criativo" />
        </CardContent>
      </Card>

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
    </>
  );
}
