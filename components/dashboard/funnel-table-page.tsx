import { ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { PageFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneText(tone: CpaTone): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 50 ? u.pathname.slice(0, 50) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url.length > 60 ? url.slice(0, 60) + "…" : url;
  }
}

export function FunnelTablePage({ rows }: { rows: PageFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem páginas de destino com dados no período.
      </p>
    );
  }

  // Best/worst por CPA, entre com compra
  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestUrl = sortedByCpa[0]?.landingUrl;
  const worstUrl = sortedByCpa[sortedByCpa.length - 1]?.landingUrl;

  const tot = rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      lpv: acc.lpv + r.landingPageView,
      chkt: acc.chkt + r.initiateCheckout,
      purchase: acc.purchase + r.purchase,
    }),
    { clicks: 0, spend: 0, lpv: 0, chkt: 0, purchase: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="bg-muted/30 sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-2 p-0" />
            <TableHead>Página</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">Conn.</TableHead>
            <TableHead className="text-right">PV</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">LP→💰</TableHead>
            <TableHead className="text-right">CHKT→💰</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const isBest = r.landingUrl && r.landingUrl === bestUrl;
            const isWorst =
              r.landingUrl && r.landingUrl === worstUrl && worstUrl !== bestUrl;
            const tone = cpaTone(cpa, r.spend);

            return (
              <TableRow key={r.landingUrl ?? `null-${idx}`}>
                <TableCell
                  className={`p-0 w-1 ${
                    isBest ? "bg-emerald-500" : isWorst ? "bg-rose-500" : ""
                  }`}
                />
                <TableCell className="max-w-[380px]">
                  {r.landingUrl ? (
                    <a
                      href={r.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      title={r.landingUrl}
                    >
                      <span className="truncate max-w-[340px]">{shortenUrl(r.landingUrl)}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">Sem URL</span>
                  )}
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
                  {fmt.int(r.clicks)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.landingPageView, r.clicks))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.int(r.landingPageView)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.purchase, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
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
            <TableCell className="text-right tabular-nums">{fmt.int(tot.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.lpv)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.lpv))}
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
