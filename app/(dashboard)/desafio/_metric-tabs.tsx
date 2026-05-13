"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/dashboard/format";
import { CycleOverlayChart } from "@/components/dashboard/cycle-overlay-chart";
import type { CycleOverlayPoint } from "@/lib/queries/dashboard";

type MetricKey = "spend" | "purchases" | "revenue" | "leads";

const METRICS: Array<{ key: MetricKey; label: string; format: "money" | "int" }> = [
  { key: "spend", label: "Investimento", format: "money" },
  { key: "purchases", label: "Vendas", format: "int" },
  { key: "revenue", label: "Receita", format: "money" },
  { key: "leads", label: "Leads", format: "int" },
];

const DOW_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface Props {
  points: CycleOverlayPoint[];
  cycleDays: number;
}

export function CycleMetricTabs({ points, cycleDays }: Props) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const def = METRICS.find((m) => m.key === metric)!;

  // Agrega por ciclo × dia do ciclo
  const byCycle = new Map<
    number,
    {
      cycleStart: string;
      cycleEnd: string;
      label: string;
      days: Map<number, number>;
      total: number;
    }
  >();
  for (const p of points) {
    if (p.cycleOffset < 0) continue;
    const e =
      byCycle.get(p.cycleOffset) ??
      {
        cycleStart: p.cycleStart,
        cycleEnd: p.cycleEnd,
        label: p.cycleLabel,
        days: new Map<number, number>(),
        total: 0,
      };
    const v = (p[metric] as number) ?? 0;
    e.days.set(p.dayInCycle, (e.days.get(p.dayInCycle) ?? 0) + v);
    e.total += v;
    byCycle.set(p.cycleOffset, e);
  }
  const calRows = [...byCycle.entries()].sort((a, b) => a[0] - b[0]).map(([offset, w]) => ({
    offset,
    ...w,
  }));

  const colHeaders =
    cycleDays === 7
      ? DOW_LABELS
      : Array.from({ length: cycleDays }, (_, i) => `D${i + 1}`);

  const fmtVal = (v: number) =>
    def.format === "money" ? fmt.money(v) : fmt.int(v);

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors",
              metric === m.key
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <CycleOverlayChart points={points} metric={metric} format={def.format} cycleDays={cycleDays} />

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-normal py-2 pl-2">Ciclo</th>
              {colHeaders.map((d) => (
                <th key={d} className="text-right font-normal py-2 px-2">
                  {d}
                </th>
              ))}
              <th className="text-right font-normal py-2 pr-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {calRows.map((r, i) => (
              <tr
                key={r.cycleStart}
                className={cn(
                  "border-t border-border/50",
                  i === 0 && "bg-primary/5 text-foreground",
                )}
              >
                <td className="py-2 pl-2 font-medium">
                  {r.label}
                  <span className="ml-2 text-muted-foreground">
                    {fmt.shortDate(r.cycleStart)} → {fmt.shortDate(r.cycleEnd)}
                  </span>
                </td>
                {Array.from({ length: cycleDays }, (_, i) => i + 1).map((day) => (
                  <td key={day} className="text-right tabular-nums px-2">
                    {fmtVal(r.days.get(day) ?? 0)}
                  </td>
                ))}
                <td className="text-right tabular-nums pr-2 font-medium">{fmtVal(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
