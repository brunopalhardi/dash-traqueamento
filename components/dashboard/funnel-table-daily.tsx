import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { DailyFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneClass(tone: CpaTone): string {
  switch (tone) {
    case "good":
      return "text-emerald-400 font-medium";
    case "bad":
      return "text-rose-400 font-medium";
    case "neutral":
      return "text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

export function FunnelTableDaily({ rows }: { rows: DailyFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem dados de tráfego no período.
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
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conn. Rate</TableHead>
            <TableHead className="text-right">PageViews</TableHead>
            <TableHead className="text-right">Checkout</TableHead>
            <TableHead className="text-right">CPA CHKT</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">CHKT→Compra</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const cpaChkt = r.initiateCheckout > 0 ? r.spend / r.initiateCheckout : NaN;
            const tone = cpaTone(cpa, r.spend);
            return (
              <TableRow key={r.date}>
                <TableCell className="tabular-nums text-sm font-medium">
                  {fmt.shortDate(r.date)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.impressions > 0 ? fmt.money((r.spend / r.impressions) * 1000) : "—"}
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
                <TableCell className={`text-right tabular-nums ${toneClass(tone)}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-medium bg-muted/20">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.impressions > 0 ? fmt.money((tot.spend / tot.impressions) * 1000) : "—"}
            </TableCell>
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
            <TableCell className="text-right tabular-nums">{fmt.money(tot.spend)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
