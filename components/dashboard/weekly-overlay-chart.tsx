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
import type { WeeklyOverlayPoint } from "@/lib/queries/dashboard";

const DOW_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const PALETTE = [
  "var(--color-primary)", // semana atual: violeta forte
  "rgba(255,255,255,0.55)",
  "rgba(255,255,255,0.35)",
  "rgba(255,255,255,0.22)",
  "rgba(255,255,255,0.14)",
];

interface Props {
  points: WeeklyOverlayPoint[];
  metric: "spend" | "revenue" | "purchases" | "leads";
  format: "money" | "int";
}

export function WeeklyOverlayChart({ points, metric, format }: Props) {
  const { rows, weeks } = useMemo(() => {
    const byWeek = new Map<string, { label: string; data: Map<number, number> }>();
    for (const p of points) {
      const e = byWeek.get(p.weekStart) ?? { label: p.weekLabel, data: new Map() };
      e.data.set(p.dayOfWeek, (e.data.get(p.dayOfWeek) ?? 0) + (p[metric] as number));
      byWeek.set(p.weekStart, e);
    }
    const weekList = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const rows = DOW_LABELS.map((dow, idx) => {
      const r: Record<string, number | string> = { dow };
      for (const [, w] of weekList) {
        r[w.label] = w.data.get(idx + 1) ?? 0;
      }
      return r;
    });
    return { rows, weeks: weekList.map(([, w]) => w.label) };
  }, [points, metric]);

  const fmtVal = (v: number) => (format === "money" ? fmt.money(v, true) : fmt.int(v, true));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="dow"
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
        {weeks.map((w, i) => (
          <Line
            key={w}
            dataKey={w}
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
