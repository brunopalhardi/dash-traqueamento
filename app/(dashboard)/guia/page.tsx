import {
  getDailySeries,
  getKpis,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { parseRangeFromSearchParams } from "@/lib/utils/date-ranges";
import {
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getBuyersForCycle,
  getDailyPurchaseSeries,
  getRevenueByCampaignName,
  getRevenueSplit,
} from "@/lib/queries/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveToggle } from "@/components/dashboard/active-toggle";
import { BuyersTable } from "@/components/dashboard/buyers-table";
import { ComparisonToggle } from "@/components/dashboard/comparison-toggle";
import { RefreshTodayButton } from "@/components/dashboard/refresh-today-button";
import { FunnelHighlights, highlightsByCpa } from "@/components/dashboard/funnel-highlights";
import { DailyBarChart, type DailyBarPoint } from "@/components/dashboard/daily-bar-chart";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { FunnelTableDaily } from "@/components/dashboard/funnel-table-daily";
import { FunnelTableCampaign } from "@/components/dashboard/funnel-table-campaign";
import { FunnelTableCreative } from "@/components/dashboard/funnel-table-creative";
import { FunnelTablePage } from "@/components/dashboard/funnel-table-page";
import {
  getCampaignFunnel,
  getCreativeFunnel,
  getDailyFunnel,
  getPageFunnel,
} from "@/lib/queries/funnel";
import { getActivePagesWithVideo } from "@/lib/queries/vturb";
import { normalizePageUrl } from "@/lib/vturb/scrape";
import { PagesVideoTable, type PageVideoTableRow } from "@/components/dashboard/pages-video-table";
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
  searchParams: Promise<{ preset?: string; cycle?: string; start?: string; end?: string; compare?: string; active?: string; hoje?: string }>;
}) {
  const sp = await searchParams;
  const { range: currentRange, label: rangeLabel, includeToday } = parseRangeFromSearchParams(sp);
  const compare = sp.compare === "1";
  const onlyActive = sp.active === "1";
  const prevRange = rangePreviousCycle(currentRange);

  const [
    kpis,
    purchaseCount, revenueHot, dailyHot, dailyMeta,
    prevKpis, prevPurchaseCount, prevRevenueHot, prevDailyHot, prevDailyMeta,
    buyers,
    dailyFunnel, campaignFunnel, creativeFunnel, pageFunnel,
    videoPages, pageFunnelActive,
    split, revByCampaign,
  ] = await Promise.all([
    getKpis("guia", currentRange),
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
    getDailyFunnel("guia", currentRange, { onlyActive }),
    getCampaignFunnel("guia", currentRange, { onlyActive }),
    getCreativeFunnel("guia", currentRange, 50, { onlyActive }),
    getPageFunnel("guia", currentRange, { onlyActive }),
    getActivePagesWithVideo("guia", currentRange),
    getPageFunnel("guia", currentRange, { onlyActive: true }),
    getRevenueSplit("guia", currentRange),
    getRevenueByCampaignName("guia", currentRange),
  ]);

  // Enriquece cada campanha com a receita Hotmart atribuída por nome (match via
  // c= do sck) e o ROAS real (receita Hotmart / gasto da linha).
  const campaignFunnelEnriched = campaignFunnel.map((c) => {
    const hotRevenue = revByCampaign.get(c.campaignName.toUpperCase()) ?? 0;
    return { ...c, hotRevenue, roasReal: c.spend > 0 ? hotRevenue / c.spend : 0 };
  });

  // Junta vídeo (VTurb, por URL normalizada) com gasto/venda (Meta, pixel) das
  // páginas ativas. A tabela é sempre sobre páginas ativas, então usa
  // pageFunnelActive (onlyActive: true), independente do toggle do topo.
  const spendByUrl = new Map<string, { spend: number; purchase: number }>();
  for (const p of pageFunnelActive) {
    const norm = normalizePageUrl(p.landingUrl);
    if (!norm) continue;
    const cur = spendByUrl.get(norm) ?? { spend: 0, purchase: 0 };
    cur.spend += p.spend; cur.purchase += p.purchase;
    spendByUrl.set(norm, cur);
  }
  const pageRows: PageVideoTableRow[] = videoPages.map((v) => {
    const u = new URL(v.pageUrl);
    const money = spendByUrl.get(v.pageUrl) ?? { spend: 0, purchase: 0 };
    return {
      pageId: v.pageId,
      host: u.hostname,
      path: u.pathname,
      health: (v.scrapeStatus === "ok" ? "ok" : v.scrapeStatus === "http_error" ? "http_error" : "no_embed") as PageVideoTableRow["health"],
      lastHttpStatus: v.lastHttpStatus,
      spend: money.spend, purchase: money.purchase,
      avgWatchedSec: v.avgWatchedSec, playRate: v.playRate, engagementRate: v.engagementRate,
      pitchRetentionRate: v.pitchRetentionRate, hasVideo: v.plays > 0,
    };
  }).sort((a, b) => b.spend - a.spend);

  // Top 5 criativos por quantidade de vendas (só os com venda).
  // Empate em vendas → desempata pelo menor CPA. O conjunto amplo
  // (creativeFunnel) alimenta os highlights, incluindo o alerta
  // "maior gasto · 0 compras", que sumiria se filtrássemos aqui.
  const topCreativesBySales = creativeFunnel
    .filter((c) => c.purchase > 0)
    .sort((a, b) => b.purchase - a.purchase || a.spend / a.purchase - b.spend / b.purchase)
    .slice(0, 5);

  const currentDaily = buildDailyPoints(currentRange, dailyHot, dailyMeta);
  const prevDaily = compare ? buildDailyPoints(prevRange, prevDailyHot, prevDailyMeta) : null;

  const cac = purchaseCount > 0 ? kpis.spend / purchaseCount : 0;
  const roas = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const ticketMedio = purchaseCount > 0 ? revenueHot / purchaseCount : 0;

  const prevCac = compare && prevPurchaseCount > 0 && prevKpis ? prevKpis.spend / prevPurchaseCount : 0;
  const prevRoas = compare && prevKpis && prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;
  const prevTicket = compare && prevPurchaseCount > 0 ? prevRevenueHot / prevPurchaseCount : 0;

  const subtitle = `${rangeLabel} · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}${includeToday ? " · hoje parcial" : " · dados até ontem"}`;

  return (
    <>
      <PageHeader
        eyebrow="guia · perpétuo"
        title="Guia"
        subtitle={subtitle}
        hidePicker
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <RefreshTodayButton />
            <ActiveToggle />
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
        />
        <KpiCard
          label="Compradores"
          value={fmt.int(purchaseCount)}
          delta={compare ? deltaOf(purchaseCount, prevPurchaseCount) : null}
        />
        <KpiCard
          label="Receita"
          value={fmt.money(revenueHot)}
          delta={compare ? deltaOf(revenueHot, prevRevenueHot) : null}
          hint={`tráfego ${fmt.money(split.trafego)} · org ${fmt.money(split.organico)} · s/atrib ${fmt.money(split.semAtribuicao)}`}
        />
        <KpiCard
          label="CAC"
          value={purchaseCount > 0 ? fmt.money(cac) : "—"}
          delta={compare && prevCac > 0 ? deltaOf(cac, prevCac) : null}
          invertDelta
          tone={purchaseCount > 0 && cac > 200 ? "warn" : undefined}
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(roas)}
          hint="alvo 2x"
          delta={compare && prevRoas > 0 ? deltaOf(roas, prevRoas) : null}
          tone={roas >= 2 ? "good" : roas >= 1 ? "warn" : roas > 0 ? "bad" : "neutral"}
        />
        <KpiCard
          label="Ticket médio"
          value={purchaseCount > 0 ? fmt.money(ticketMedio) : "—"}
          delta={compare && prevTicket > 0 ? deltaOf(ticketMedio, prevTicket) : null}
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
            Compradores do período · {buyers.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BuyersTable buyers={buyers} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento diário do funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelHighlights
            items={highlightsByCpa(
              dailyFunnel.map((d) => ({
                label: fmt.shortDate(d.date),
                spend: d.spend,
                purchase: d.purchase,
              })),
            )}
          />
          <FunnelTableDaily rows={dailyFunnel} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento por campanha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelHighlights
            items={highlightsByCpa(
              campaignFunnel.map((c) => ({
                label: c.campaignName,
                spend: c.spend,
                purchase: c.purchase,
              })),
            )}
          />
          <FunnelTableCampaign rows={campaignFunnelEnriched} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento por criativo · top 5 por vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelHighlights
            items={highlightsByCpa(
              creativeFunnel.map((c) => ({
                label: c.adName,
                spend: c.spend,
                purchase: c.purchase,
              })),
            )}
          />
          <FunnelTableCreative rows={topCreativesBySales} basePath="/guia/criativo" />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento por página de destino
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelHighlights
            items={highlightsByCpa(
              pageFunnel.map((p) => ({
                label: p.landingUrl ?? "Sem URL",
                spend: p.spend,
                purchase: p.purchase,
              })),
            )}
          />
          <FunnelTablePage rows={pageFunnel} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Páginas ativas · vídeo (VSL)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PagesVideoTable rows={pageRows} />
        </CardContent>
      </Card>
    </>
  );
}
