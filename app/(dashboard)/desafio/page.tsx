import { TrendingUp, ShoppingCart, DollarSign, Target, Activity, Users } from "lucide-react";
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
  getInGroupStats,
  getRevenueSplit,
} from "@/lib/queries/purchases";
import { getSendflowGroupSummary } from "@/lib/queries/sendflow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyersTable } from "@/components/dashboard/buyers-table";
import { ComparisonToggle } from "@/components/dashboard/comparison-toggle";
import { RefreshTodayButton } from "@/components/dashboard/refresh-today-button";
import { DailyBarChart, type DailyBarPoint } from "@/components/dashboard/daily-bar-chart";
import { fmt } from "@/components/dashboard/format";
import { SendflowGroupPanel } from "@/components/dashboard/sendflow-group-panel";
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

export default async function DesafioPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; cycle?: string; start?: string; end?: string; compare?: string; hoje?: string }>;
}) {
  const sp = await searchParams;
  const { range: currentRange, label: rangeLabel, includeToday } = parseRangeFromSearchParams(sp);
  const compare = sp.compare === "1";
  const prevRange = rangePreviousCycle(currentRange);

  const [
    kpis, adsTbl, sendflowSummary,
    purchaseCount, revenueHot, inGroup, dailyHot, dailyMeta,
    prevKpis, prevPurchaseCount, prevRevenueHot, prevDailyHot, prevDailyMeta,
    buyers,
    split,
  ] = await Promise.all([
    getKpis("desafio", currentRange),
    getTopAds("desafio", currentRange, { limit: 5, orderBy: "cpa", onlyActive: true }),
    getSendflowGroupSummary(currentRange),
    getApprovedPurchaseCount("desafio", currentRange),
    getApprovedPurchaseRevenue("desafio", currentRange),
    getInGroupStats("desafio", currentRange),
    getDailyPurchaseSeries("desafio", currentRange),
    getDailySeries("desafio", currentRange),
    compare ? getKpis("desafio", prevRange) : Promise.resolve(null),
    compare ? getApprovedPurchaseCount("desafio", prevRange) : Promise.resolve(0),
    compare ? getApprovedPurchaseRevenue("desafio", prevRange) : Promise.resolve(0),
    compare ? getDailyPurchaseSeries("desafio", prevRange) : Promise.resolve([]),
    compare ? getDailySeries("desafio", prevRange) : Promise.resolve([]),
    getBuyersForCycle("desafio", currentRange),
    getRevenueSplit("desafio", currentRange),
  ]);

  const currentDaily = buildDailyPoints(currentRange, dailyHot, dailyMeta);
  const prevDaily = compare ? buildDailyPoints(prevRange, prevDailyHot, prevDailyMeta) : null;

  const cac = purchaseCount > 0 ? kpis.spend / purchaseCount : 0;
  const roas = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const inGroupPct = inGroup.buyersWithPhone > 0
    ? (inGroup.inGroup / inGroup.buyersWithPhone) * 100
    : 0;

  const prevCac = compare && prevPurchaseCount > 0 && prevKpis ? prevKpis.spend / prevPurchaseCount : 0;
  const prevRoas = compare && prevKpis && prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;

  const subtitle = `${rangeLabel} · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}${includeToday ? " · hoje parcial" : " · dados até ontem"}`;

  return (
    <>
      <PageHeader
        title="Desafio"
        subtitle={subtitle}
        hidePicker
        right={
          <div className="flex items-center gap-2">
            <RefreshTodayButton />
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
          hint={`tráfego ${fmt.money(split.trafego)} · org ${fmt.money(split.organico)} · s/atrib ${fmt.money(split.semAtribuicao)}${purchaseCount > 0 ? ` · TM ${fmt.money(revenueHot / purchaseCount)}` : ""}`}
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
          label="No grupo"
          value={`${inGroupPct.toFixed(0)}%`}
          hint={`${inGroup.inGroup} de ${inGroup.buyersWithPhone}`}
          icon={Users}
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
            Top criativos · ativos por menor CPA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TopCreativesGrid ads={adsTbl} limit={5} basePath="/desafio/criativo" />
        </CardContent>
      </Card>

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

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Grupos WhatsApp — SendFlow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SendflowGroupPanel data={sendflowSummary} />
        </CardContent>
      </Card>
    </>
  );
}
