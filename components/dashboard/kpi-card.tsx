import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { label: string; positive: boolean } | null;
  hint?: string;
  /** Inverte semântica do delta (ex.: CPL menor é melhor) */
  invertDelta?: boolean;
  icon?: LucideIcon;
}

export function KpiCard({ label, value, delta, hint, invertDelta, icon: Icon }: KpiCardProps) {
  const goodPositive = invertDelta ? !delta?.positive : delta?.positive;
  return (
    <Card className="bg-card border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          {Icon ? (
            <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Icon className="h-3.5 w-3.5" />
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums text-foreground tracking-tight">
          {value}
        </div>
        {delta || hint ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {delta ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  goodPositive ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {delta.positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {delta.label}
              </span>
            ) : null}
            {hint ? <span className="text-muted-foreground">{hint}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
