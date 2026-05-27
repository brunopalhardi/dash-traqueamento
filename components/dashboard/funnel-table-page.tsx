import { ExternalLink, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fmt, cpaTone, type CpaTone } from "./format";
import type { PageFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

interface ParsedUrl {
  host: string;
  path: string;
  initials: string;
  gradient: string;
}

/** Gera gradient determinístico baseado no hash do host. */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

function pickInitials(host: string): string {
  // ex: "guia-alzheimer-v1-hc.lovable.app" → "GA"
  const cleaned = host.replace(/^www\./, "").split(".")[0];
  const parts = cleaned.split(/[-_]/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + (parts[1][0] ?? parts[0][1] ?? "")).toUpperCase();
}

function parseUrl(url: string | null): ParsedUrl | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = (u.pathname === "/" ? "/" : u.pathname) + u.search;
    const truncatedPath = path.length > 56 ? path.slice(0, 56) + "…" : path;
    const initials = pickInitials(host);
    const hue = hashHue(host);
    const gradient = `linear-gradient(135deg, hsl(${hue}, 65%, 55%) 0%, hsl(${(hue + 25) % 360}, 70%, 45%) 100%)`;
    return { host, path: truncatedPath, initials, gradient };
  } catch {
    return null;
  }
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

interface FunnelStageProps {
  label: string;
  pct: number;
  /** Quando true, oculta a barra (estágio vazio/inválido). */
  empty?: boolean;
  /** Override de cor (good/bad/warn). Default usa gradient indigo→violet→purple */
  tone?: "good" | "bad" | "warn" | "default";
  /** Posição na sequência do funil — usado pra pintar gradient adequado */
  position: "top" | "mid" | "bottom";
}

function FunnelStage({ label, pct, empty, tone = "default", position }: FunnelStageProps) {
  const display = empty || !isFinite(pct) ? "—" : fmt.pct1(pct);
  const valueColor =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-foreground";
  // gradient por posição (top→indigo, mid→violet, bottom→emerald se good / rose se bad)
  const fillStyle: React.CSSProperties = (() => {
    if (empty) return { width: 0 };
    const w = Math.max(0, Math.min(100, pct));
    if (tone === "good") return { width: `${w}%`, background: "#34d399" };
    if (tone === "bad") return { width: `${w}%`, background: "#f87171" };
    if (tone === "warn") return { width: `${w}%`, background: "#fbbf24" };
    if (position === "top")
      return {
        width: `${w}%`,
        background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)",
      };
    if (position === "mid")
      return {
        width: `${w}%`,
        background: "linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%)",
      };
    return { width: `${w}%`, background: "#34d399" };
  })();

  return (
    <div className={empty ? "opacity-40" : ""}>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono tabular-nums font-medium ${valueColor}`}>{display}</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full" style={fillStyle} />
      </div>
    </div>
  );
}

export function FunnelTablePage({ rows }: { rows: PageFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem páginas de destino com dados no período.
      </p>
    );
  }

  const withPurchase = rows.filter((r) => r.purchase > 0);
  const sortedByCpa = [...withPurchase].sort(
    (a, b) => a.spend / a.purchase - b.spend / b.purchase,
  );
  const bestUrl = sortedByCpa[0]?.landingUrl;
  const worstUrl = sortedByCpa[sortedByCpa.length - 1]?.landingUrl;

  const warnRow = [...rows]
    .filter((r) => r.purchase === 0 && r.spend >= 50)
    .sort((a, b) => b.spend - a.spend)[0];
  const warnUrl = warnRow?.landingUrl;

  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  // Totals
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
    <div className="space-y-3">
      {rows.map((r, idx) => {
        const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
        const isBest = r.landingUrl !== null && r.landingUrl === bestUrl;
        const isWorst =
          r.landingUrl !== null && r.landingUrl === worstUrl && worstUrl !== bestUrl;
        const isWarn = r.landingUrl !== null && r.landingUrl === warnUrl;
        const t = cpaTone(cpa, r.spend);
        const tone = toneFor({ isBest, isWorst, isWarn, cpaTone: t });
        const spendBarPct = Math.min(100, (r.spend / maxSpend) * 100);
        const parsed = parseUrl(r.landingUrl);

        // Calcula taxas do funil pós-clique
        const connRate = ratio(r.landingPageView, r.clicks);
        const lpToChktRate = ratio(r.initiateCheckout, r.landingPageView);
        const chktToBuyRate = ratio(r.purchase, r.initiateCheckout);

        return (
          <article
            key={r.landingUrl ?? `null-${idx}`}
            className={`relative rounded-md border ${tone.border} bg-card overflow-hidden ${
              parsed === null ? "opacity-70" : ""
            }`}
          >
            {tone.overlay && (
              <div className={`pointer-events-none absolute inset-0 ${tone.overlay}`} />
            )}

            <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_auto_auto] items-stretch">
              {/* LEFT zone — URL with favicon */}
              <div className="p-5 min-w-0 lg:border-r border-border/60">
                <div className="flex items-start gap-3">
                  {parsed ? (
                    <div
                      className="h-8 w-8 rounded-md flex items-center justify-center font-mono text-[11px] font-semibold text-white flex-shrink-0 border border-white/10"
                      style={{ background: parsed.gradient }}
                    >
                      {parsed.initials}
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-md flex items-center justify-center font-mono text-[11px] font-semibold text-muted-foreground/60 flex-shrink-0 border border-dashed border-border/60 bg-card">
                      ?
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {isBest && <Ribbon kind="winner" label="Melhor CPA" />}
                      {isWorst && <Ribbon kind="loser" label="Pior CPA" />}
                      {isWarn && !isBest && !isWorst && (
                        <Ribbon kind="warn" label="0 compras" />
                      )}
                    </div>
                    {parsed ? (
                      <>
                        <div
                          className="font-mono text-[13px] font-medium text-foreground truncate"
                          title={r.landingUrl ?? ""}
                        >
                          {parsed.host}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground truncate">
                          {parsed.path}
                        </div>
                        <a
                          href={r.landingUrl ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] tracking-wide text-muted-foreground/70 hover:text-foreground transition-colors inline-flex items-center gap-1 mt-2 lowercase"
                        >
                          abrir página
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </>
                    ) : (
                      <>
                        <div className="font-mono text-[13px] text-muted-foreground/70 italic truncate">
                          Sem URL identificada
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground/60 mt-0.5">
                          ads sem object_story_spec — arquivados / antigos
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* MIDDLE zone — hero metrics */}
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
              </div>

              {/* RIGHT zone — funnel pós-clique */}
              <div className="p-5 lg:min-w-[280px]">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-3">
                  Funil pós-clique
                </div>
                {parsed ? (
                  <div className="space-y-2.5">
                    <FunnelStage
                      label="Click → PV"
                      pct={connRate}
                      position="top"
                      empty={r.clicks === 0}
                    />
                    <FunnelStage
                      label="PV → CHKT"
                      pct={lpToChktRate}
                      position="mid"
                      tone={r.purchase === 0 && r.spend >= 50 ? "warn" : "default"}
                      empty={r.landingPageView === 0}
                    />
                    <FunnelStage
                      label="CHKT → 💰"
                      pct={chktToBuyRate}
                      position="bottom"
                      tone={isBest ? "good" : isWorst ? "bad" : "default"}
                      empty={r.initiateCheckout === 0}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/60 italic">
                    sem dados de funil
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

      {/* Totals strip */}
      <article className="rounded-md border border-border bg-card p-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Páginas únicas
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.int(rows.length)}
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
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Click → PV
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              PV → CHKT
            </div>
            <div className="font-mono font-medium tabular-nums text-xl leading-none tracking-tight mt-1.5">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
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
