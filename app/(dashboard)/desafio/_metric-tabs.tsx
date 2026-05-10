"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/dashboard/format";
import { WeeklyOverlayChart } from "@/components/dashboard/weekly-overlay-chart";
import type { WeeklyOverlayPoint } from "@/lib/queries/dashboard";

type MetricKey = "spend" | "purchases" | "revenue" | "leads";

const METRICS: Array<{ key: MetricKey; label: string; format: "money" | "int" }> = [
  { key: "spend", label: "Investimento", format: "money" },
  { key: "purchases", label: "Vendas", format: "int" },
  { key: "revenue", label: "Receita", format: "money" },
  { key: "leads", label: "Leads", format: "int" },
];

interface Props {
  points: WeeklyOverlayPoint[];
}

export function WeeklyMetricTabs({ points }: Props) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const def = METRICS.find((m) => m.key === metric)!;

  // Tabela calendário (mesmo dataset, agrupado por semana × dia)
  const byWeek = new Map<
    string,
    { label: string; days: Map<number, number>; total: number }
  >();
  for (const p of points) {
    const e = byWeek.get(p.weekStart) ?? {
      label: p.weekLabel,
      days: new Map<number, number>(),
      total: 0,
    };
    const v = (p[metric] as number) ?? 0;
    e.days.set(p.dayOfWeek, (e.days.get(p.dayOfWeek) ?? 0) + v);
    e.total += v;
    byWeek.set(p.weekStart, e);
  }
  const calRows = [...byWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStart, w]) => ({ weekStart, ...w }));

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

      <WeeklyOverlayChart points={points} metric={metric} format={def.format} />

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-normal py-2 pl-2">Semana</th>
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
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
                key={r.weekStart}
                className={cn(
                  "border-t border-border/50",
                  i === 0 && "bg-primary/5 text-foreground",
                )}
              >
                <td className="py-2 pl-2 font-medium">
                  {r.label}
                  <span className="ml-2 text-muted-foreground">{fmt.shortDate(r.weekStart)}</span>
                </td>
                {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                  <td key={dow} className="text-right tabular-nums px-2">
                    {fmtVal(r.days.get(dow) ?? 0)}
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
