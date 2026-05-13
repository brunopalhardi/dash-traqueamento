import { DollarSign, TrendingUp, Target, Users2, Wallet } from "lucide-react";
import {
  getDailySeries,
  getKpis,
  getProductBreakdown,
  rangeLastDays,
  rangePreviousPeriod,
} from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComboChart } from "@/components/dashboard/combo-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;

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

  return (
    <>
      <PageHeader
        title="Visão Geral"
        subtitle="Investimento e ROAS consolidados de todos os produtos"
        rangeDays={DEFAULT_DAYS}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Investimento"
          value={fmt.money(kpis.spend)}
          delta={fmt.delta(kpis.spend, prevKpis.spend)}
          invertDelta
          icon={Wallet}
        />
        <KpiCard
          label="Receita (Pixel)"
          value={fmt.money(kpis.revenue)}
          delta={fmt.delta(kpis.revenue, prevKpis.revenue)}
          icon={DollarSign}
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(kpis.roas)}
          delta={fmt.delta(kpis.roas, prevKpis.roas)}
          hint={`vs ${fmt.ratio(prevKpis.roas)} anterior`}
          icon={TrendingUp}
        />
        <KpiCard
          label="Leads"
          value={fmt.int(kpis.leads)}
          delta={fmt.delta(kpis.leads, prevKpis.leads)}
          icon={Users2}
        />
        <KpiCard
          label="CPL médio"
          value={fmt.money(kpis.cpl)}
          delta={fmt.delta(kpis.cpl, prevKpis.cpl)}
          invertDelta
          icon={Target}
        />
      </section>

      <Card className="bg-card/60 border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Investimento × Receita por dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ComboChart
              data={daily}
              xKey="date"
              series={[
                {
                  key: "spend",
                  label: "Investimento",
                  type: "bar",
                  color: "var(--color-chart-1)",
                  format: "money",
                },
                {
                  key: "revenue",
                  label: "Receita",
                  type: "line",
                  color: "var(--color-chart-3)",
                  format: "money",
                },
              ]}
            />
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/60">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Por produto</CardTitle>
        </CardHeader>
        <CardContent>
          {breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum gasto detectado por produto no período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Investido</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((r) => (
                  <TableRow key={r.productSlug}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.money(r.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.int(r.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.int(r.purchases)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.money(r.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.ratio(r.roas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
