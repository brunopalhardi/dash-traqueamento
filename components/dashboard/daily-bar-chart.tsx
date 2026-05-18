"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { fmt } from "./format";

export interface DailyBarPoint {
  date: string; // YYYY-MM-DD
  vendas: number;
  receita: number;
  investido: number;
  roas: number;
}

interface DailyBarChartProps {
  current: DailyBarPoint[];
  previous?: DailyBarPoint[] | null;
}

type Metric = "vendas" | "receita" | "investido" | "roas";

const METRICS: Array<{ key: Metric; label: string; format: (v: number) => string }> = [
  { key: "vendas", label: "Vendas", format: (v) => fmt.int(v) },
  { key: "receita", label: "Receita", format: (v) => fmt.money(v) },
  { key: "investido", label: "Investido", format: (v) => fmt.money(v) },
  { key: "roas", label: "ROAS", format: (v) => fmt.ratio(v) },
];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function DailyBarChart({ current, previous }: DailyBarChartProps) {
  const [metric, setMetric] = useState<Metric>("vendas");
  const metricCfg = METRICS.find((m) => m.key === metric)!;

  // Pair current[i] with previous[i] by position (index-based alignment).
  // O período anterior é exibido alinhado pelo dia-do-período (1º dia anterior = 1º dia atual).
  const merged = current.map((p, i) => ({
    date: shortDate(p.date),
    value: p[metric],
    prev: previous?.[i]?.[metric] ?? null,
  }));

  const total = current.reduce((s, p) => s + p[metric], 0);
  const avgDaily = current.length > 0 ? total / current.length : 0;
  const best = current.reduce<{ v: number; d: string } | null>((acc, p) => {
    return !acc || p[metric] > acc.v ? { v: p[metric], d: p.date } : acc;
  }, null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-4 text-xs">
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Total
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {metricCfg.format(total)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Média diária
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {metricCfg.format(avgDaily)}
            </div>
          </div>
          {best && best.v > 0 ? (
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                Melhor
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {metricCfg.format(best.v)}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  em {shortDate(best.d)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-md border border-border/60 p-0.5 bg-card">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn(
                "px-2.5 py-1 text-xs rounded transition-colors",
                metric === m.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={merged} barCategoryGap="20%">
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => metricCfg.format(Number(v))}
              width={70}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(v) => metricCfg.format(Number(v))}
            />
            {previous && previous.length > 0 ? (
              <Bar dataKey="prev" fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
            ) : null}
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {merged.map((_, i) => (
                <Cell key={i} fill="var(--color-primary)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
