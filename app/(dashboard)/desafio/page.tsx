import {
  getCycleOverlay,
  getKpis,
  rangeCurrentCycle,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CycleSelector } from "@/components/dashboard/cycle-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
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

  const [kpis, prevKpis, overlay] = await Promise.all([
    getKpis("desafio", currentRange),
    getKpis("desafio", prevRange),
    getCycleOverlay("desafio", { cycleDays, cyclesBack: CYCLES_BACK, custom }),
  ]);

  const hasData = overlay.some((p) => p.cycleOffset === 0);
  const subtitle = custom
    ? `Custom · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)} (${cycleDays} dias)`
    : `Ciclo ${cycleDays} dias · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}  (vs ciclo anterior)`;

  return (
    <>
      <PageHeader title="Desafio" subtitle={subtitle} hidePicker right={<CycleSelector defaultCycle={DEFAULT_CYCLE} />} />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Investido"
          value={fmt.money(kpis.spend)}
          delta={fmt.delta(kpis.spend, prevKpis.spend)}
          invertDelta
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
        <KpiCard
          label="Ticket médio"
          value={fmt.money(kpis.ticket)}
          delta={fmt.delta(kpis.ticket, prevKpis.ticket)}
        />
      </section>

      <Card className="bg-card border-border/60">
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
    </>
  );
}
