import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { CampaignFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneText(tone: CpaTone): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

function StatusDot({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full mr-2 ${
        isActive ? "bg-emerald-400" : "bg-muted-foreground/50"
      }`}
      title={isActive ? "ATIVO" : status}
    />
  );
}

export function FunnelTableCampaign({ rows }: { rows: CampaignFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem campanhas com dados no período.
      </p>
    );
  }

  // Best/worst por CPA, entre com compras
  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestId = sortedByCpa[0]?.campaignId;
  const worstId = sortedByCpa[sortedByCpa.length - 1]?.campaignId;

  const tot = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      lpv: acc.lpv + r.landingPageView,
      chkt: acc.chkt + r.initiateCheckout,
      purchase: acc.purchase + r.purchase,
    }),
    { impressions: 0, clicks: 0, spend: 0, lpv: 0, chkt: 0, purchase: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="bg-muted/30 sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-2 p-0" />
            <TableHead>Campanha</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conn.</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">CHKT→💰</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">Freq.</TableHead>
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">PV</TableHead>
            <TableHead className="text-right">CHKT</TableHead>
            <TableHead className="text-right">CPA CHKT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const cpaChkt = r.initiateCheckout > 0 ? r.spend / r.initiateCheckout : NaN;
            const freq = r.reach > 0 ? r.impressions / r.reach : 0;
            const isBest = r.campaignId === bestId;
            const isWorst = r.campaignId === worstId && worstId !== bestId;
            const tone = cpaTone(cpa, r.spend);

            return (
              <TableRow key={r.campaignId} className="group">
                <TableCell
                  className={`p-0 w-1 ${
                    isBest
                      ? "bg-emerald-500"
                      : isWorst
                        ? "bg-rose-500"
                        : ""
                  }`}
                  title={isBest ? "Melhor CPA" : isWorst ? "Pior CPA" : ""}
                />
                <TableCell className="font-medium max-w-[320px]">
                  <div className="flex items-center min-w-0">
                    <StatusDot status={r.status} />
                    <span className="truncate" title={r.campaignName}>
                      {r.campaignName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmt.int(r.purchase)}
                </TableCell>
                <TableCell className={`text-right tabular-nums ${toneText(tone)}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {fmt.money(r.spend)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.clicks, r.impressions))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.landingPageView, r.clicks))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.int(r.impressions)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {freq > 0 ? fmt.ratio(freq) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.impressions > 0 ? fmt.money((r.spend / r.impressions) * 1000) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.int(r.clicks)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.int(r.landingPageView)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.int(r.initiateCheckout)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {isFinite(cpaChkt) ? fmt.money(cpaChkt) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 border-border font-medium bg-muted/30">
            <TableCell className="p-0" />
            <TableCell>Total · {rows.length}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.purchase)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.money(tot.spend)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.clicks, tot.impressions))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.clicks > 0 ? fmt.money(tot.spend / tot.clicks) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">—</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.impressions > 0 ? fmt.money((tot.spend / tot.impressions) * 1000) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.lpv)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.chkt)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.chkt > 0 ? fmt.money(tot.spend / tot.chkt) : "—"}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
