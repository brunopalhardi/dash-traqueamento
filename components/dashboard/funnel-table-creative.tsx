import Link from "next/link";
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
import type { CreativeFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneClass(tone: CpaTone): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

export function FunnelTableCreative({
  rows,
  basePath,
}: {
  rows: CreativeFunnelRow[];
  basePath: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem criativos com dados no período.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thumb</TableHead>
            <TableHead>Anúncio</TableHead>
            <TableHead>Link LP</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">TxConv AD</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const tone = cpaTone(cpa, r.spend);
            const adHref = `${basePath}/${r.adId}`;
            return (
              <TableRow key={r.adId}>
                <TableCell className="w-[60px]">
                  <Link href={adHref}>
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-medium" title={r.adName}>
                  <Link href={adHref} className="hover:underline">
                    {r.adName}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[240px]">
                  {r.landingUrl ? (
                    <a
                      href={r.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      title={r.landingUrl}
                    >
                      <span className="truncate max-w-[200px]">{shortenUrl(r.landingUrl)}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.clicks, r.impressions))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.purchase)}</TableCell>
                <TableCell className={`text-right tabular-nums ${toneClass(tone)}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.clicks))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
