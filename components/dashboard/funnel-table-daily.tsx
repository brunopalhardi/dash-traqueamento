import { fmt, cpaTone, type CpaTone } from "./format";
import { Sparkline } from "./sparkline";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import type { DailyFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function parseDate(iso: string): { day: string; month: string; weekday: string } {
  const d = new Date(iso + "T12:00:00");
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: MONTHS[d.getMonth()] ?? "",
    weekday: WEEKDAYS[d.getDay()] ?? "",
  };
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

interface MiniStageProps {
  label: string;
  value: number;
  color: string; // hex
  empty?: boolean;
  valueColor?: string;
}
function MiniStage({ label, value, color, empty, valueColor }: MiniStageProps) {
  return (
    <div
      className={`relative flex-1 h-7 rounded-[3px] flex items-center justify-center ${
        empty ? "opacity-40" : ""
      }`}
      style={{ background: `${color}26` }}
    >
      <span
        className="absolute -top-[13px] left-0 right-0 text-center font-mono text-[8px] tracking-[0.14em] uppercase text-muted-foreground/60 font-medium leading-none"
        aria-hidden
      >
        {label}
      </span>
      <span
        className={`relative z-[1] font-mono text-[11px] font-semibold tracking-tight ${
          empty ? "text-muted-foreground/50" : valueColor ?? ""
        }`}
      >
        {fmt.int(value)}
      </span>
    </div>
  );
}

const STAGE_COLORS = {
  impr: "#4f46e5",
  click: "#6366f1",
  pv: "#8b5cf6",
  chkt: "#a855f7",
  buy: "#34d399",
};

export function FunnelTableDaily({ rows }: { rows: DailyFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem dados de tráfego no período.
      </p>
    );
  }

  // Rows vêm ordenadas date DESC. Pra sparkline queremos cronológico ASC.
  const asc = [...rows].reverse();
  const cpaSeries = asc.map((r) =>
    r.purchase > 0 ? r.spend / r.purchase : 0,
  );
  const purchasesSeries = asc.map((r) => r.purchase);
  const spendSeries = asc.map((r) => r.spend);
  const connSeries = asc.map((r) => ratio(r.landingPageView, r.clicks));

  // Best/worst day por CPA entre dias com compra
  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestDate = sortedByCpa[0]?.date;
  const worstDate = sortedByCpa[sortedByCpa.length - 1]?.date;

  // Atenção: maior gasto sem compra
  const warnRow = [...rows]
    .filter((r) => r.purchase === 0 && r.spend >= 50)
    .sort((a, b) => b.spend - a.spend)[0];
  const warnDate = warnRow?.date;

  // Totals
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

  // Sumários para os trend cards (valor agregado)
  const totalCpa = tot.purchase > 0 ? tot.spend / tot.purchase : NaN;
  const avgSpendPerDay = tot.spend / rows.length;
  const totalConn = ratio(tot.lpv, tot.clicks);

  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  return (
    <div className="space-y-4">
      {/* TREND CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <TrendCard
          label="CPA Médio"
          value={isFinite(totalCpa) ? fmt.money(totalCpa) : "—"}
          color="#f87171"
          values={cpaSeries.filter((v) => v > 0)}
          firstDate={asc[0]?.date}
          lastDate={asc[asc.length - 1]?.date}
        />
        <TrendCard
          label="Compras"
          value={fmt.int(tot.purchase)}
          color="#34d399"
          values={purchasesSeries}
          firstDate={asc[0]?.date}
          lastDate={asc[asc.length - 1]?.date}
        />
        <TrendCard
          label="Gasto / dia"
          value={fmt.money(avgSpendPerDay)}
          color="#fbbf24"
          values={spendSeries}
          firstDate={asc[0]?.date}
          lastDate={asc[asc.length - 1]?.date}
        />
        <TrendCard
          label="Conn. Rate"
          value={fmt.pct1(totalConn)}
          color="#8b5cf6"
          values={connSeries}
          firstDate={asc[0]?.date}
          lastDate={asc[asc.length - 1]?.date}
        />
      </div>

      {/* DAILY ROWS */}
      <div className="space-y-2">
        {rows.map((r) => {
          const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
          const isBest = r.date === bestDate && bestDate !== undefined;
          const isWorst = r.date === worstDate && worstDate !== bestDate && worstDate !== undefined;
          const isWarn = r.date === warnDate && warnDate !== undefined;
          const t = cpaTone(cpa, r.spend);
          const tone = toneFor({ isBest, isWorst, isWarn, cpaTone: t });
          const parsed = parseDate(r.date);
          const spendBarPct = Math.min(100, (r.spend / maxSpend) * 100);
          const ctr = ratio(r.clicks, r.impressions);
          const conn = ratio(r.landingPageView, r.clicks);

          return (
            <article
              key={r.date}
              className={`relative rounded-md border ${tone.border} bg-card overflow-hidden`}
            >
              {tone.overlay && (
                <div className={`pointer-events-none absolute inset-0 ${tone.overlay}`} />
              )}

              <div className="relative grid grid-cols-1 lg:grid-cols-[100px_auto_1fr_auto] items-center gap-4 px-5 py-4">
                {/* Date block */}
                <div>
                  <div className="font-mono font-medium tabular-nums text-4xl leading-none tracking-tight">
                    {parsed.day}
                  </div>
                  <div className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground mt-1">
                    {parsed.month}
                  </div>
                  <div className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60 mt-0.5">
                    {parsed.weekday}
                  </div>
                </div>

                {/* Hero stats */}
                <div className="flex items-center gap-6 lg:gap-8 flex-wrap">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      CPA
                    </div>
                    <div
                      className={`font-mono font-medium tabular-nums text-[28px] leading-none tracking-tight mt-1.5 ${tone.cpaText}`}
                    >
                      {isFinite(cpa) ? fmt.money(cpa) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                      Compras
                    </div>
                    <div
                      className={`font-mono font-medium tabular-nums text-[28px] leading-none tracking-tight mt-1.5 ${
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
                    <div className="font-mono font-medium tabular-nums text-[28px] leading-none tracking-tight mt-1.5">
                      {fmt.money(r.spend)}
                    </div>
                  </div>
                </div>

                {/* Mini funnel inline com labels */}
                <div className="flex items-center gap-1 pt-4 min-w-0">
                  <MiniStage label="IMPR" value={r.impressions} color={STAGE_COLORS.impr} />
                  <span className="text-muted-foreground/60 text-xs px-0.5">→</span>
                  <MiniStage label="CLIQUES" value={r.clicks} color={STAGE_COLORS.click} />
                  <span className="text-muted-foreground/60 text-xs px-0.5">→</span>
                  <MiniStage
                    label="PAGEVIEWS"
                    value={r.landingPageView}
                    color={STAGE_COLORS.pv}
                    empty={r.landingPageView === 0}
                  />
                  <span className="text-muted-foreground/60 text-xs px-0.5">→</span>
                  <MiniStage
                    label="CHECKOUT"
                    value={r.initiateCheckout}
                    color={STAGE_COLORS.chkt}
                    empty={r.initiateCheckout === 0}
                  />
                  <span className="text-muted-foreground/60 text-xs px-0.5">→</span>
                  <MiniStage
                    label="COMPRAS"
                    value={r.purchase}
                    color={STAGE_COLORS.buy}
                    empty={r.purchase === 0}
                    valueColor={
                      isBest
                        ? "text-emerald-400"
                        : isWorst
                          ? "text-rose-400"
                          : ""
                    }
                  />
                </div>

                {/* Right tag + meta */}
                <div className="text-right space-y-1.5 min-w-[110px]">
                  {isBest && <Ribbon kind="winner" label="Melhor dia" />}
                  {isWorst && <Ribbon kind="loser" label="Pior CPA" />}
                  {isWarn && !isBest && !isWorst && <Ribbon kind="warn" label="0 compras" />}
                  <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
                    ctr {fmt.pct1(ctr)}
                  </div>
                  {r.landingPageView > 0 && (
                    <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
                      conn {fmt.pct1(conn)}
                    </div>
                  )}
                </div>
              </div>

              {/* spend perf bar */}
              <div className="relative h-0.5 bg-muted/30">
                <div
                  className={`h-full ${tone.bar}`}
                  style={{ width: `${spendBarPct}%`, opacity: 0.65 }}
                />
              </div>
            </article>
          );
        })}
      </div>

      {/* Totals strip */}
      <article className="rounded-md border border-border bg-card p-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Dias com compra
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {withPurchase.length} / {rows.length}
            </div>
          </div>
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
              CPA Médio
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {isFinite(totalCpa) ? fmt.money(totalCpa) : "—"}
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
              CHKT → 💰
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

function TrendCard({
  label,
  value,
  color,
  values,
  firstDate,
  lastDate,
}: {
  label: string;
  value: string;
  color: string;
  values: number[];
  firstDate?: string;
  lastDate?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
        {label}
      </div>
      <div className="font-mono font-medium tabular-nums text-[32px] leading-none tracking-tight mt-2">
        {value}
      </div>
      <div className="mt-3">
        <Sparkline values={values} color={color} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1.5 font-mono">
        <span>{firstDate ? shortDate(firstDate) : ""}</span>
        <span>{lastDate ? shortDate(lastDate) : ""}</span>
      </div>
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}`;
}
