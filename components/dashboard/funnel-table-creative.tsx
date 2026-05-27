import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { CreativeFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 28 ? u.pathname.slice(0, 28) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url.length > 36 ? url.slice(0, 36) + "…" : url;
  }
}

function StatusPip({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded bg-black/70 backdrop-blur-sm">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isActive ? "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/80" : "bg-zinc-500"
        }`}
      />
      <span
        className={`text-[10px] tracking-wider uppercase font-medium ${
          isActive ? "text-white" : "text-zinc-400"
        }`}
      >
        {isActive ? "Ativo" : "Pausado"}
      </span>
    </div>
  );
}

interface RibbonProps {
  kind: "winner" | "loser" | "warn";
  label: string;
}
function Ribbon({ kind, label }: RibbonProps) {
  const styles =
    kind === "winner"
      ? { bg: "bg-emerald-400", text: "text-emerald-950" }
      : kind === "loser"
        ? { bg: "bg-rose-400", text: "text-rose-950" }
        : { bg: "bg-amber-400", text: "text-amber-950" };
  const Icon = kind === "winner" ? TrendingUp : kind === "loser" ? TrendingDown : AlertTriangle;
  return (
    <div
      className={`absolute top-3 right-3 ${styles.bg} ${styles.text} font-mono font-medium text-[10px] tracking-wider px-1.5 py-1 rounded uppercase inline-flex items-center gap-1`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </div>
  );
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

  // best/worst CPA entre os com compra
  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestId = sortedByCpa[0]?.adId;
  const worstId = sortedByCpa[sortedByCpa.length - 1]?.adId;

  // maior gasto sem compra (atenção)
  const warnRow = [...rows]
    .filter((r) => r.purchase === 0 && r.spend >= 50)
    .sort((a, b) => b.spend - a.spend)[0];
  const warnId = warnRow?.adId;

  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r) => {
        const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
        const ctrVal = ratio(r.clicks, r.impressions);
        const convVal = ratio(r.purchase, r.clicks);
        const tone: CpaTone = cpaTone(cpa, r.spend);
        const isBest = r.adId === bestId && bestId !== undefined;
        const isWorst = r.adId === worstId && worstId !== bestId && worstId !== undefined;
        const isWarn = r.adId === warnId && warnId !== undefined;
        const adHref = `${basePath}/${r.adId}`;
        const spendBarPct = Math.min(100, (r.spend / maxSpend) * 100);

        const cardBorder = isBest
          ? "border-emerald-400/35"
          : isWorst
            ? "border-rose-400/35"
            : isWarn
              ? "border-amber-400/30"
              : "border-border";

        const cardOverlay = isBest
          ? "bg-emerald-400/[0.05]"
          : isWorst
            ? "bg-rose-400/[0.05]"
            : isWarn
              ? "bg-amber-400/[0.04]"
              : "";

        const cpaColor = isBest
          ? "text-emerald-400"
          : isWorst
            ? "text-rose-400"
            : tone === "good"
              ? "text-emerald-400"
              : tone === "bad"
                ? "text-rose-400"
                : tone === "neutral"
                  ? "text-amber-400"
                  : "text-foreground";

        const barColor = isBest
          ? "bg-emerald-400"
          : isWorst
            ? "bg-rose-400"
            : isWarn
              ? "bg-amber-400"
              : "bg-muted-foreground/60";

        return (
          <article
            key={r.adId}
            className={`group relative rounded-md border ${cardBorder} bg-card overflow-hidden transition-colors hover:border-border-hi`}
          >
            {/* tinted overlay */}
            {cardOverlay && (
              <div className={`pointer-events-none absolute inset-0 ${cardOverlay}`} />
            )}

            <div className="relative">
              <Link href={adHref}>
                <div className="relative aspect-video overflow-hidden bg-black/30">
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      className={`w-full h-full object-cover ${
                        r.status === "ACTIVE" ? "" : "opacity-70 grayscale"
                      }`}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                      sem thumb
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent pointer-events-none" />
                  <StatusPip status={r.status} />
                  {isBest && <Ribbon kind="winner" label="Melhor CPA" />}
                  {isWorst && <Ribbon kind="loser" label="Pior CPA" />}
                  {isWarn && !isBest && !isWorst && <Ribbon kind="warn" label="0 compras" />}
                </div>
              </Link>

              <div className="p-5 space-y-4">
                <div className="min-w-0">
                  <h3
                    className="font-medium leading-tight truncate tracking-tight"
                    title={r.adName}
                  >
                    <Link href={adHref} className="hover:underline">
                      {r.adName}
                    </Link>
                  </h3>
                  {r.landingUrl && (
                    <a
                      href={r.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] tracking-wide text-muted-foreground/70 hover:text-foreground transition-colors inline-flex items-center gap-1 mt-1 lowercase"
                      title={r.landingUrl}
                    >
                      <span className="truncate max-w-[220px]">
                        {shortenUrl(r.landingUrl)}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                    </a>
                  )}
                </div>

                {/* Hero metric: CPA + Compras */}
                <div className="flex items-end justify-between gap-2 pt-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      CPA
                    </div>
                    <div
                      className={`font-mono font-medium tabular-nums text-4xl leading-none tracking-tight mt-1.5 ${cpaColor}`}
                    >
                      {isFinite(cpa) ? fmt.money(cpa) : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      Compras
                    </div>
                    <div
                      className={`font-mono font-medium tabular-nums text-2xl leading-none tracking-tight mt-1.5 ${
                        r.purchase === 0 ? "text-muted-foreground/60" : ""
                      }`}
                    >
                      {fmt.int(r.purchase)}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border/60" />

                {/* 4 supporting metrics */}
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      CTR
                    </div>
                    <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                      {fmt.pct1(ctrVal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      Cliques
                    </div>
                    <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                      {fmt.int(r.clicks)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      CPC
                    </div>
                    <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                      {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      TxConv
                    </div>
                    <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                      {fmt.pct1(convVal)}
                    </div>
                  </div>
                </div>

                {/* Footer impressions + spend */}
                <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {fmt.int(r.impressions)} impr
                  </span>
                  <span className="font-mono tabular-nums text-foreground font-medium">
                    {fmt.money(r.spend)}
                  </span>
                </div>

                {/* spend perf bar */}
                <div className="h-0.5 w-full bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor}`}
                    style={{ width: `${spendBarPct}%`, opacity: 0.65 }}
                  />
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
