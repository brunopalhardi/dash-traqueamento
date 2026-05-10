import Image from "next/image";
import {
  getDailySeries,
  getKpis,
  getTopAds,
  rangeLastDays,
  rangePreviousPeriod,
  type DailyPoint,
} from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComboChart } from "@/components/dashboard/combo-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { getProduct, type ProductSlug } from "@/lib/products";

/** Adiciona média móvel 7d de receita à série diária */
function withMovingAverage(daily: DailyPoint[]): Array<DailyPoint & { revenueMa7: number }> {
  const window = 7;
  return daily.map((p, i) => {
    const slice = daily.slice(Math.max(0, i - window + 1), i + 1);
    const sum = slice.reduce((s, x) => s + x.revenue, 0);
    return { ...p, revenueMa7: slice.length > 0 ? sum / slice.length : 0 };
  });
}

interface Props {
  slug: ProductSlug;
  searchParams: Promise<{ range?: string }>;
}

export async function PerpetuoDashboard({ slug, searchParams }: Props) {
  const product = getProduct(slug);
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number(sp.range ?? product.defaultRangeDays)));
  const range = rangeLastDays(days);
  const prev = rangePreviousPeriod(range);

  const [kpis, prevKpis, daily, topAds] = await Promise.all([
    getKpis(slug, range),
    getKpis(slug, prev),
    getDailySeries(slug, range),
    getTopAds(slug, range, { limit: 30, orderBy: "spend" }),
  ]);

  const dailyPlot = withMovingAverage(daily);
  const hasData = daily.length > 0;

  return (
    <>
      <PageHeader
        title={product.label}
        subtitle={product.description}
        rangeDays={product.defaultRangeDays}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <KpiCard
          label="Investimento"
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
          label="CPL"
          value={fmt.money(kpis.cpl)}
          delta={fmt.delta(kpis.cpl, prevKpis.cpl)}
          invertDelta
        />
        <KpiCard
          label="CPA"
          value={fmt.money(kpis.cpa)}
          delta={fmt.delta(kpis.cpa, prevKpis.cpa)}
          invertDelta
        />
        <KpiCard
          label="Ticket médio"
          value={fmt.money(kpis.ticket)}
          delta={fmt.delta(kpis.ticket, prevKpis.ticket)}
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
              data={dailyPlot}
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
                {
                  key: "revenueMa7",
                  label: "Receita (méd. 7d)",
                  type: "line",
                  color: "var(--color-chart-4)",
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
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Anúncios — ranking por investimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topAds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem anúncios no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Anúncio</TableHead>
                  <TableHead className="text-right">Investido</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topAds.map((a) => (
                  <TableRow key={a.adId}>
                    <TableCell className="w-10">
                      {a.thumbnailUrl ? (
                        <Image
                          src={a.thumbnailUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="rounded object-cover h-8 w-8"
                          unoptimized
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-xs">{a.adName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(a.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.int(a.purchases)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(a.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.ratio(a.roas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.money(a.cpa)}</TableCell>
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
