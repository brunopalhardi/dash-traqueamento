import type { LucideIcon } from "lucide-react";

export type KpiAccent = "violet" | "emerald" | "amber" | "rose" | "sky" | "fuchsia";
export type KpiTone = "good" | "warn" | "bad" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { label: string; positive: boolean } | null;
  hint?: string;
  /** Inverte semântica do delta (ex.: CPL menor é melhor) */
  invertDelta?: boolean;
  /** Override do rail. Sem passar, infere do delta. */
  tone?: KpiTone;
  /** Mantido por compatibilidade — não usado visualmente no design atual. */
  icon?: LucideIcon;
  /** Mantido por compatibilidade — não usado visualmente no design atual. */
  accent?: KpiAccent;
}

const RAIL: Record<KpiTone, string> = {
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-rose-400",
  neutral: "bg-muted-foreground/30",
};

const DELTA_STYLES: Record<"good" | "bad", { bg: string; text: string }> = {
  good: { bg: "bg-emerald-400/12", text: "text-emerald-400" },
  bad: { bg: "bg-rose-400/12", text: "text-rose-400" },
};

function inferTone(
  delta: { positive: boolean } | null | undefined,
  invertDelta: boolean | undefined,
): KpiTone {
  if (!delta) return "neutral";
  const goodPositive = invertDelta ? !delta.positive : delta.positive;
  return goodPositive ? "good" : "bad";
}

export function KpiCard({
  label,
  value,
  delta,
  hint,
  invertDelta,
  tone,
}: KpiCardProps) {
  const resolvedTone = tone ?? inferTone(delta, invertDelta);
  const goodPositive = delta ? (invertDelta ? !delta.positive : delta.positive) : false;
  const deltaStyle = delta ? DELTA_STYLES[goodPositive ? "good" : "bad"] : null;

  // Em grid de 6 colunas o card é estreito; valores longos (ex.: receita na
  // casa dos milhares em lançamento) estouravam e eram cortados pelo
  // overflow-hidden. Escala a fonte pelo comprimento do texto.
  const valueSize =
    value.length <= 9
      ? "text-[30px]"
      : value.length <= 12
        ? "text-2xl"
        : "text-xl";

  return (
    <div className="relative rounded-md border border-border bg-card pl-[22px] pr-5 py-[18px] overflow-hidden transition-colors hover:border-border-hi">
      <div className={`absolute inset-y-0 left-0 w-0.5 ${RAIL[resolvedTone]}`} />

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-medium">
          {label}
        </div>
        {delta && deltaStyle ? (
          <span
            className={`font-mono tabular-nums text-[11px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${deltaStyle.bg} ${deltaStyle.text}`}
          >
            {delta.positive ? "↑" : "↓"} {delta.label.replace(/^[+-]/, "")}
          </span>
        ) : null}
      </div>

      <div
        className={`font-mono font-medium tabular-nums ${valueSize} leading-none tracking-tight mt-2.5 whitespace-nowrap`}
      >
        {value}
      </div>

      {hint ? (
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mt-1.5">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
