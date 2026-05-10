import Image from "next/image";
import {
  getDailySeries,
  getKpis,
  getTopAds,
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

const DEFAULT_DAYS = 30;

export default async function C1Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number(sp.range ?? DEFAULT_DAYS)));
  const range = rangeLastDays(days);
  const prev = rangePreviousPeriod(range);

  const [kpis, prevKpis, daily, topAds] = await Promise.all([
    getKpis("c1", range),
    getKpis("c1", prev),
    getDailySeries("c1", range),
    getTopAds("c1", range, { limit: 30, orderBy: "spend" }),
  ]);

  const hasData = daily.length > 0;

  return (
    <>
      <PageHeader
        title="C1 — Atração"
        subtitle="Posts impulsionados pra ganho de seguidores e alcance"
        rangeDays={DEFAULT_DAYS}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Investimento"
          value={fmt.money(kpis.spend)}
          delta={fmt.delta(kpis.spend, prevKpis.spend)}
          invertDelta
        />
        <KpiCard
          label="Impressões"
          value={fmt.int(kpis.impressions, true)}
          delta={fmt.delta(kpis.impressions, prevKpis.impressions)}
        />
        <KpiCard
          label="Alcance"
          value={fmt.int(kpis.reach, true)}
          delta={fmt.delta(kpis.reach, prevKpis.reach)}
        />
        <KpiCard
          label="CPM"
          value={fmt.money(kpis.cpm)}
          delta={fmt.delta(kpis.cpm, prevKpis.cpm)}
          invertDelta
        />
        <KpiCard
          label="Engajamento"
          value={fmt.int(kpis.engagement, true)}
          delta={fmt.delta(kpis.engagement, prevKpis.engagement)}
          hint={`${fmt.int(kpis.follows)} novos seguidores`}
        />
      </section>

      <Card className="bg-card/60 border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Impressões × CPM por dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ComboChart
              data={daily.map((d) => ({
                ...d,
                cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
              }))}
              xKey="date"
              series={[
                {
                  key: "impressions",
                  label: "Impressões",
                  type: "bar",
                  color: "var(--color-chart-2)",
                  format: "int",
                },
                {
                  key: "cpm",
                  label: "CPM",
                  type: "line",
                  color: "var(--color-chart-3)",
                  format: "money",
                  yAxisId: "right",
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
            Por anúncio (top {topAds.length})
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
                  <TableHead className="text-right">Impressões</TableHead>
                  <TableHead className="text-right">CPM</TableHead>
                  <TableHead className="text-right">Investido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topAds.map((a) => {
                  const cpm = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0;
                  return (
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
                      <TableCell className="text-right tabular-nums">
                        {fmt.int(a.impressions, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt.money(cpm)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt.money(a.spend)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
