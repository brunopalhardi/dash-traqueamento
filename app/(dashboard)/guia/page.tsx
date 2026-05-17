import {
  getCycleOverlay,
  getFunnelMetrics,
  getHierarchyTable,
  getKpis,
  rangeCurrentCycle,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { getBuyersForCycle } from "@/lib/queries/purchases";
import { BuyersTable } from "@/components/dashboard/buyers-table";
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

  const [kpis, prevKpis, overlay, funnel, adsTbl, buyers] = await Promise.all([
    getKpis("guia", currentRange),
    getKpis("guia", prevRange),
    getCycleOverlay("guia", { cycleDays, cyclesBack: CYCLES_BACK, custom }),
    getFunnelMetrics("guia", currentRange),
    getHierarchyTable("guia", currentRange, "ad"),
    getBuyersForCycle("guia", currentRange),
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
