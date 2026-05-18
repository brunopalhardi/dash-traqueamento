import { cn } from "@/lib/utils";
import { fmt } from "./format";

export interface FunnelStage {
  label: string;
  value: number;
  /** Formato do valor (number com separadores ou moeda) */
  format?: "int" | "money";
}

interface ConversionFunnelProps {
  stages: FunnelStage[];
}

function formatValue(stage: FunnelStage): string {
  if (stage.format === "money") return fmt.money(stage.value);
  return fmt.int(stage.value, true);
}

export function ConversionFunnel({ stages }: ConversionFunnelProps) {
  if (stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">Sem dados.</p>
    );
  }

  const max = Math.max(...stages.map((s) => s.value));

  return (
    <div className="space-y-4">
      {stages.map((stage, idx) => {
        const prev = idx > 0 ? stages[idx - 1].value : 0;
        const dropPct = idx > 0 && prev > 0 ? 100 - (stage.value / prev) * 100 : null;
        const widthPct = max > 0 ? (stage.value / max) * 100 : 0;
        const isLast = idx === stages.length - 1;

        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground">{stage.label}</span>
              <span className="text-sm tabular-nums">
                <span className="font-semibold">{formatValue(stage)}</span>
                {dropPct != null ? (
                  <span
                    className={cn(
                      "ml-2 text-xs",
                      dropPct > 50 ? "text-rose-400" : "text-muted-foreground",
                    )}
                  >
                    ({dropPct.toFixed(1)}% queda)
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isLast
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                    : "bg-gradient-to-r from-primary/80 to-primary",
                )}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
