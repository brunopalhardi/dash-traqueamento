"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { useMemo } from "react";
import { fmt } from "./format";
import type { CycleOverlayPoint } from "@/lib/queries/dashboard";

const DOW_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const PALETTE = [
  "var(--color-primary)", // ciclo atual: gold forte
  "rgba(255,255,255,0.55)",
  "rgba(255,255,255,0.35)",
  "rgba(255,255,255,0.22)",
  "rgba(255,255,255,0.14)",
];

interface Props {
  points: CycleOverlayPoint[];
  metric: "spend" | "revenue" | "purchases" | "leads";
  format: "money" | "int";
  cycleDays: number;
}

export function CycleOverlayChart({ points, metric, format, cycleDays }: Props) {
  const { rows, cycles } = useMemo(() => {
    const byCycle = new Map<
      number,
      { label: string; data: Map<number, number> }
    >();
    for (const p of points) {
      if (p.cycleOffset < 0) continue;
      const e =
        byCycle.get(p.cycleOffset) ?? { label: p.cycleLabel, data: new Map() };
      e.data.set(p.dayInCycle, (e.data.get(p.dayInCycle) ?? 0) + (p[metric] as number));
      byCycle.set(p.cycleOffset, e);
    }

    // Eixo X: pra ciclo de 7 dias usa "Seg..Dom"; pra outros usa "Dia 1..N"
    const xLabels =
      cycleDays === 7
        ? DOW_LABELS
        : Array.from({ length: cycleDays }, (_, i) => `Dia ${i + 1}`);

    const rows = xLabels.map((xLabel, idx) => {
      const r: Record<string, number | string> = { xLabel };
      for (const [, w] of byCycle) {
        r[w.label] = w.data.get(idx + 1) ?? 0;
      }
      return r;
    });

    // Ordem: atual primeiro, depois -1, -2, …
    const cycleList = [...byCycle.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, w]) => w.label);

    return { rows, cycles: cycleList };
  }, [points, metric, cycleDays]);

  const fmtVal = (v: number) => (format === "money" ? fmt.money(v, true) : fmt.int(v, true));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="xLabel"
          stroke="rgba(255,255,255,0.4)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="rgba(255,255,255,0.4)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmtVal(v as number)}
          width={64}
        />
        <Tooltip
          contentStyle={{
            background: "oklch(0.21 0.006 60)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => {
            const num = typeof value === "number" ? value : Number(value);
            return [fmtVal(num), String(name)];
          }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {cycles.map((c, i) => (
          <Line
            key={c}
            dataKey={c}
            stroke={PALETTE[i] ?? PALETTE[PALETTE.length - 1]}
            strokeWidth={i === 0 ? 3 : 1.5}
            dot={i === 0 ? { r: 3 } : false}
            activeDot={{ r: 4 }}
            type="monotone"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
