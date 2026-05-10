import { getKpis, getWeeklyOverlay, rangeCurrentWeek } from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { WeeklyMetricTabs } from "./_metric-tabs";

export const dynamic = "force-dynamic";

const WEEKS_OVERLAY = 5;

export default async function DesafioPage() {
  const week = rangeCurrentWeek();
  // Semana passada inteira pra comparação
  const lastWeekStart = new Date(week.from + "T00:00:00");
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
  const prev = {
    from: lastWeekStart.toISOString().slice(0, 10),
    to: lastWeekEnd.toISOString().slice(0, 10),
  };

  const [kpis, prevKpis, overlay] = await Promise.all([
    getKpis("desafio", week),
    getKpis("desafio", prev),
    getWeeklyOverlay("desafio", WEEKS_OVERLAY),
  ]);

  const hasData = overlay.length > 0;
  const weekLabel = `${fmt.shortDate(week.from)} → ${fmt.shortDate(week.to)}`;

  return (
    <>
      <PageHeader
        title="Desafio"
        subtitle={`Semana corrente · ${weekLabel} (vs semana passada inteira)`}
        hidePicker
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Investido (semana)"
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

      <Card className="bg-card/60 border-border/60">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Comparação semanal · últimas {WEEKS_OVERLAY} semanas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? <WeeklyMetricTabs points={overlay} /> : <EmptyState />}
        </CardContent>
      </Card>
    </>
  );
}
