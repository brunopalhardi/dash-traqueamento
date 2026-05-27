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

function toneClass(tone: CpaTone): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

export function FunnelTableCampaign({ rows }: { rows: CampaignFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem campanhas com dados no período.
      </p>
    );
  }

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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campanha</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">Freq.</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conn. Rate</TableHead>
            <TableHead className="text-right">PageView</TableHead>
            <TableHead className="text-right">CHKT</TableHead>
            <TableHead className="text-right">CPA CHKT</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">CHKT→Compra</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const cpaChkt = r.initiateCheckout > 0 ? r.spend / r.initiateCheckout : NaN;
            const freq = r.reach > 0 ? r.impressions / r.reach : 0;
            return (
              <TableRow key={r.campaignId}>
                <TableCell className="font-medium max-w-[300px] truncate" title={r.campaignName}>
                  {r.campaignName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.impressions > 0 ? fmt.money((r.spend / r.impressions) * 1000) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {freq > 0 ? fmt.ratio(freq) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.clicks, r.impressions))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.landingPageView, r.clicks))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.landingPageView)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.initiateCheckout)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {isFinite(cpaChkt) ? fmt.money(cpaChkt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.purchase)}</TableCell>
                <TableCell className={`text-right tabular-nums ${toneClass(cpaTone(cpa, r.spend))}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-medium bg-muted/20">
            <TableCell>Total ({rows.length})</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.impressions > 0 ? fmt.money((tot.spend / tot.impressions) * 1000) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">—</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.clicks, tot.impressions))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.clicks > 0 ? fmt.money(tot.spend / tot.clicks) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.lpv)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.chkt)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.chkt > 0 ? fmt.money(tot.spend / tot.chkt) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.purchase)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.money(tot.spend)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
