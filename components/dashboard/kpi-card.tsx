import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { label: string; positive: boolean } | null;
  hint?: string;
  /** Inverte semântica do delta (ex.: CPL menor é melhor) */
  invertDelta?: boolean;
}

export function KpiCard({ label, value, delta, hint, invertDelta }: KpiCardProps) {
  const goodPositive = invertDelta ? !delta?.positive : delta?.positive;
  return (
    <Card className="bg-card/60 border-border/60 backdrop-blur">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</div>
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
      </CardContent>
    </Card>
  );
}
