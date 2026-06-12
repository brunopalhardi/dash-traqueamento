import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { CampaignFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function objectiveLabel(objective: string | null): string {
  if (!objective) return "—";
  // Meta retorna OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_AWARENESS...
  // Renderiza algo curto e legível
  const map: Record<string, string> = {
    OUTCOME_SALES: "vendas",
    OUTCOME_LEADS: "leads",
    OUTCOME_TRAFFIC: "tráfego",
    OUTCOME_AWARENESS: "alcance",
    OUTCOME_ENGAGEMENT: "engajamento",
    OUTCOME_APP_PROMOTION: "app",
  };
  return map[objective] ?? objective.replace("OUTCOME_", "").toLowerCase();
}

function StatusPip({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isActive
            ? "bg-emerald-400 shadow-[0_0_5px] shadow-emerald-400/80"
            : "bg-zinc-600"
        }`}
      />
      <span
        className={`text-[10px] tracking-wider uppercase font-medium ${
          isActive ? "text-muted-foreground" : "text-muted-foreground/60"
        }`}
      >
        {isActive ? "Ativo" : "Pausado"}
      </span>
    </span>
  );
}

interface Tone {
  border: string;
  overlay: string;
  bar: string;
  cpaText: string;
}

function toneFor(args: {
  isBest: boolean;
  isWorst: boolean;
  isWarn: boolean;
  cpaTone: CpaTone;
}): Tone {
  const { isBest, isWorst, isWarn, cpaTone: t } = args;
  if (isBest)
    return {
      border: "border-emerald-400/35",
      overlay: "bg-emerald-400/[0.05]",
      bar: "bg-emerald-400",
      cpaText: "text-emerald-400",
    };
  if (isWorst)
    return {
      border: "border-rose-400/35",
      overlay: "bg-rose-400/[0.05]",
      bar: "bg-rose-400",
      cpaText: "text-rose-400",
    };
  if (isWarn)
    return {
      border: "border-amber-400/35",
      overlay: "bg-amber-400/[0.04]",
      bar: "bg-amber-400",
      cpaText: "text-amber-400",
    };
  const cpaText =
    t === "good"
      ? "text-emerald-400"
      : t === "bad"
        ? "text-rose-400"
        : t === "neutral"
          ? "text-amber-400"
          : "text-foreground";
  return {
    border: "border-border",
    overlay: "",
    bar: "bg-muted-foreground/40",
    cpaText,
  };
}

interface RibbonProps {
  kind: "winner" | "loser" | "warn";
  label: string;
}
function Ribbon({ kind, label }: RibbonProps) {
  const styles =
    kind === "winner"
      ? { bg: "bg-emerald-400/15", text: "text-emerald-400" }
      : kind === "loser"
        ? { bg: "bg-rose-400/15", text: "text-rose-400" }
        : { bg: "bg-amber-400/15", text: "text-amber-400" };
  const Icon = kind === "winner" ? TrendingUp : kind === "loser" ? TrendingDown : AlertTriangle;
  return (
    <span
      className={`${styles.bg} ${styles.text} font-mono font-medium text-[10px] tracking-wider px-1.5 py-0.5 rounded uppercase inline-flex items-center gap-1`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
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

  // best/worst CPA entre os com compra
  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestId = sortedByCpa[0]?.campaignId;
  const worstId = sortedByCpa[sortedByCpa.length - 1]?.campaignId;

  const warnRow = [...rows]
    .filter((r) => r.purchase === 0 && r.spend >= 50)
    .sort((a, b) => b.spend - a.spend)[0];
  const warnId = warnRow?.campaignId;

  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  // Totais
  const tot = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      linkClicks: acc.linkClicks + r.linkClicks,
      spend: acc.spend + r.spend,
      lpv: acc.lpv + r.landingPageView,
      chkt: acc.chkt + r.initiateCheckout,
      purchase: acc.purchase + r.purchase,
      hotRevenue: acc.hotRevenue + (r.hotRevenue ?? 0),
    }),
    { impressions: 0, clicks: 0, linkClicks: 0, spend: 0, lpv: 0, chkt: 0, purchase: 0, hotRevenue: 0 },
  );
  const totRoasReal = tot.spend > 0 ? tot.hotRevenue / tot.spend : 0;
  const totRoasRealText =
    totRoasReal >= 1
      ? "text-emerald-400"
      : totRoasReal > 0
        ? "text-rose-400"
        : "text-muted-foreground";

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
        const freq = r.reach > 0 ? r.impressions / r.reach : 0;
        const isBest = r.campaignId === bestId && bestId !== undefined;
        const isWorst = r.campaignId === worstId && worstId !== bestId && worstId !== undefined;
        const isWarn = r.campaignId === warnId && warnId !== undefined;
        const isPaused = r.status !== "ACTIVE";
        const t = cpaTone(cpa, r.spend);
        const tone = toneFor({ isBest, isWorst, isWarn, cpaTone: t });
        const spendBarPct = Math.min(100, (r.spend / maxSpend) * 100);
        // ROAS real (receita Hotmart / gasto): verde ≥1, vermelho >0 e <1, neutro 0
        const roasReal = r.roasReal ?? 0;
        const roasRealText =
          roasReal >= 1
            ? "text-emerald-400"
            : roasReal > 0
              ? "text-rose-400"
              : "text-muted-foreground";

        return (
          <article
            key={r.campaignId}
            className={`relative rounded-md border ${tone.border} bg-card overflow-hidden transition-colors hover:border-border-hi ${
              isPaused ? "opacity-60" : ""
            }`}
          >
            {tone.overlay && (
              <div className={`pointer-events-none absolute inset-0 ${tone.overlay}`} />
            )}

            <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] items-stretch">
              {/* LEFT zone — identity */}
              <div className="p-5 min-w-0 lg:border-r border-border/60">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <StatusPip status={r.status} />
                  {isBest && <Ribbon kind="winner" label="Melhor CPA" />}
                  {isWorst && <Ribbon kind="loser" label="Pior CPA" />}
                  {isWarn && !isBest && !isWorst && <Ribbon kind="warn" label="0 compras" />}
                </div>
                <h3
                  className="font-medium leading-tight tracking-tight truncate text-foreground"
                  title={r.campaignName}
                >
                  {r.campaignName}
                </h3>
                <div className="font-mono text-[10px] tracking-wide text-muted-foreground/70 mt-1.5 lowercase">
                  {objectiveLabel(r.objective)} · {r.adsetCount} {r.adsetCount === 1 ? "cj" : "cj"}
                  {" · "}
                  {r.adCount} {r.adCount === 1 ? "ad" : "ads"}
                </div>
              </div>

              {/* MIDDLE zone — hero stats */}
              <div className="p-5 lg:px-8 lg:border-r border-border/60 flex items-center gap-6 lg:gap-8 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    CPA
                  </div>
                  <div
                    className={`font-mono font-medium tabular-nums text-3xl leading-none tracking-tight mt-1.5 ${tone.cpaText}`}
                  >
                    {isFinite(cpa) ? fmt.money(cpa) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    Compras
                  </div>
                  <div
                    className={`font-mono font-medium tabular-nums text-3xl leading-none tracking-tight mt-1.5 ${
                      r.purchase === 0 ? "text-muted-foreground/60" : ""
                    }`}
                  >
                    {fmt.int(r.purchase)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    Gasto
                  </div>
                  <div className="font-mono font-medium tabular-nums text-3xl leading-none tracking-tight mt-1.5">
                    {fmt.money(r.spend)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    Receita Hot
                  </div>
                  <div className="font-mono font-medium tabular-nums text-3xl leading-none tracking-tight mt-1.5">
                    {fmt.money(r.hotRevenue ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    ROAS real
                  </div>
                  <div
                    className={`font-mono font-medium tabular-nums text-3xl leading-none tracking-tight mt-1.5 ${roasRealText}`}
                  >
                    {fmt.ratio(r.roasReal ?? 0)}
                  </div>
                </div>
              </div>

              {/* RIGHT zone — funnel rates 3x2 */}
              <div className="p-5 grid grid-cols-3 gap-x-6 gap-y-3 lg:min-w-[280px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    CTR
                  </div>
                  <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                    {fmt.pct1(ratio(r.clicks, r.impressions))}
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
                    Freq
                  </div>
                  <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                    {freq > 0 ? fmt.ratio(freq) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    Connect rate
                  </div>
                  <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                    {fmt.pct1(ratio(r.landingPageView, r.linkClicks))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    LP→CHKT
                  </div>
                  <div className="font-mono text-sm tabular-nums mt-1 font-medium">
                    {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                    CHKT→💰
                  </div>
                  <div
                    className={`font-mono text-sm tabular-nums mt-1 font-medium ${
                      r.purchase > 0 && r.initiateCheckout > 0 ? tone.cpaText : ""
                    }`}
                  >
                    {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                  </div>
                </div>
              </div>
            </div>

            {/* spend perf bar full width */}
            <div className="relative h-0.5 bg-muted/30">
              <div
                className={`h-full ${tone.bar}`}
                style={{ width: `${spendBarPct}%`, opacity: 0.65 }}
              />
            </div>
          </article>
        );
      })}

      {/* Totals strip */}
      <article className="rounded-md border border-border bg-card p-5">
        <div className="grid grid-cols-2 md:grid-cols-8 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Total Compras
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.int(tot.purchase)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Receita Hot
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.money(tot.hotRevenue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              ROAS real
            </div>
            <div
              className={`font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5 ${totRoasRealText}`}
            >
              {fmt.ratio(totRoasReal)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              CPA Médio
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Gasto Total
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.money(tot.spend)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              CTR Médio
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.pct1(ratio(tot.clicks, tot.impressions))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Connect rate méd.
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.pct1(ratio(tot.lpv, tot.linkClicks))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              CHKT→💰
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
