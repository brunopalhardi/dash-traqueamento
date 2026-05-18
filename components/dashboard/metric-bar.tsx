import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricBarProps {
  label: string;
  /** Valor formatado pra display (ex.: "59.7%", "R$ 1.51", "1.234") */
  value: string;
  /** Percentual 0-100 pra largura da barra */
  percent: number;
  /** Tipo de gradient — define a cor */
  variant?: "ctr" | "hook" | "hold" | "body" | "cpl" | "score" | "spend";
  icon?: LucideIcon;
}

const VARIANT_GRADIENT: Record<NonNullable<MetricBarProps["variant"]>, string> = {
  ctr: "from-pink-500 to-rose-400",
  hook: "from-sky-500 to-blue-400",
  hold: "from-blue-500 to-indigo-400",
  body: "from-indigo-500 to-violet-400",
  cpl: "from-violet-500 to-fuchsia-400",
  score: "from-fuchsia-500 to-pink-400",
  spend: "from-emerald-500 to-teal-400",
};

export function MetricBar({ label, value, percent, variant = "ctr", icon: Icon }: MetricBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          {Icon ? <Icon className="h-3 w-3" /> : null}
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all", VARIANT_GRADIENT[variant])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
