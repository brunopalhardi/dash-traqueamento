import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { CreativeFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneAccent(tone: CpaTone): { border: string; text: string; bg: string } {
  switch (tone) {
    case "good":
      return {
        border: "border-emerald-500/40",
        text: "text-emerald-400",
        bg: "bg-emerald-500/[0.04]",
      };
    case "bad":
      return {
        border: "border-rose-500/40",
        text: "text-rose-400",
        bg: "bg-rose-500/[0.04]",
      };
    case "neutral":
      return {
        border: "border-amber-500/30",
        text: "text-amber-400",
        bg: "",
      };
    default:
      return { border: "border-border/60", text: "text-muted-foreground", bg: "" };
  }
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        isActive
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isActive ? "bg-emerald-400" : "bg-muted-foreground"
        }`}
      />
      {isActive ? "ATIVO" : "PAUSADO"}
    </span>
  );
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 24 ? u.pathname.slice(0, 24) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "…" : url;
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

  // Identifica top e bottom por CPA (entre os que têm compra)
  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestAdId = sortedByCpa[0]?.adId;
  const worstAdId = sortedByCpa[sortedByCpa.length - 1]?.adId;
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((r) => {
        const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
        const ctrVal = ratio(r.clicks, r.impressions);
        const convVal = ratio(r.purchase, r.clicks);
        const tone = cpaTone(cpa, r.spend);
        const accent = toneAccent(tone);
        const isBest = r.adId === bestAdId;
        const isWorst = r.adId === worstAdId && worstAdId !== bestAdId;
        const adHref = `${basePath}/${r.adId}`;
        const spendBarPct = Math.min(100, (r.spend / maxSpend) * 100);

        return (
          <div
            key={r.adId}
            className={`group relative rounded-lg ring-1 ${accent.border} ${accent.bg} overflow-hidden hover:ring-2 transition-all`}
          >
            {/* Best/worst banner */}
            {(isBest || isWorst) && (
              <div
                className={`absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isBest
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {isBest ? (
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-2.5 w-2.5" /> Melhor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <TrendingDown className="h-2.5 w-2.5" /> Pior
                  </span>
                )}
              </div>
            )}

            <Link href={adHref} className="block">
              <div className="relative aspect-video w-full bg-muted/30 overflow-hidden">
                {r.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                    sem thumb
                  </div>
                )}
                {/* Status no canto sup esq */}
                <div className="absolute top-2 left-2">
                  <StatusBadge status={r.status} />
                </div>
              </div>
            </Link>

            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={adHref}
                  className="text-sm font-medium leading-tight hover:underline truncate min-w-0 flex-1"
                  title={r.adName}
                >
                  {r.adName}
                </Link>
              </div>

              {r.landingUrl && (
                <a
                  href={r.landingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  title={r.landingUrl}
                >
                  <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="truncate max-w-[200px]">{shortenUrl(r.landingUrl)}</span>
                </a>
              )}

              {/* Grid de 4 métricas-chave */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Compras</div>
                  <div className="text-base font-semibold tabular-nums">{fmt.int(r.purchase)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CPA</div>
                  <div className={`text-base font-semibold tabular-nums ${accent.text}`}>
                    {isFinite(cpa) ? fmt.money(cpa) : "—"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CTR</div>
                  <div className="text-base font-semibold tabular-nums">{fmt.pct1(ctrVal)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Conv.</div>
                  <div className="text-base font-semibold tabular-nums">{fmt.pct1(convVal)}</div>
                </div>
              </div>

              {/* Linha de detalhes secundários */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span className="tabular-nums">{fmt.int(r.impressions)} impr</span>
                <span className="tabular-nums">{fmt.int(r.clicks)} cliques</span>
                <span className="tabular-nums font-medium text-foreground">{fmt.money(r.spend)}</span>
              </div>

              {/* Barra de gasto relativo */}
              <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    tone === "good"
                      ? "bg-emerald-500/60"
                      : tone === "bad"
                        ? "bg-rose-500/60"
                        : "bg-primary/60"
                  }`}
                  style={{ width: `${spendBarPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
