"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { fmt } from "./format";

interface SeriesDef {
  key: string;
  label: string;
  type: "bar" | "line";
  color: string;
  format?: "money" | "int";
  yAxisId?: "left" | "right";
}

interface ComboChartProps {
  data: ReadonlyArray<object>;
  xKey: string;
  series: SeriesDef[];
  height?: number;
}

export function ComboChart({ data, xKey, series, height = 280 }: ComboChartProps) {
  const fmtVal = (v: number, type?: "money" | "int") =>
    type === "money" ? fmt.money(v, true) : fmt.int(v, true);
  const usesRight = series.some((s) => s.yAxisId === "right");

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: usesRight ? 12 : 8, left: 8, bottom: 8 }}>
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          stroke="rgba(255,255,255,0.5)"
          fontSize={10}
          fontFamily="var(--font-mono)"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt.shortDate(v) : v
          }
        />
        <YAxis
          yAxisId="left"
          stroke="rgba(255,255,255,0.5)"
          fontSize={10}
          fontFamily="var(--font-mono)"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            fmtVal(
              v as number,
              series.find((s) => (s.yAxisId ?? "left") === "left")?.format,
            )
          }
          width={56}
        />
        {usesRight ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="rgba(255,255,255,0.5)"
            fontSize={10}
            fontFamily="var(--font-mono)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => fmtVal(v as number, series.find((s) => s.yAxisId === "right")?.format)}
            width={56}
          />
        ) : null}
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
          labelStyle={{
            color: "var(--color-foreground)",
            fontFamily: "var(--font-mono)",
          }}
          itemStyle={{ color: "var(--color-foreground)" }}
          labelFormatter={(v) =>
            typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt.shortDate(v) : v
          }
          formatter={(value, name, item) => {
            const def = series.find((s) => s.key === item?.dataKey);
            const num = typeof value === "number" ? value : Number(value);
            return [fmtVal(num, def?.format), def?.label ?? String(name)];
          }}
        />
        <Legend
          iconType="square"
          wrapperStyle={{
            fontSize: 10,
            paddingTop: 12,
            fontFamily: "var(--font-mono)",
            textTransform: "lowercase",
            letterSpacing: "0.04em",
          }}
          formatter={(value) => series.find((s) => s.key === value)?.label ?? value}
        />
        {series.map((s) =>
          s.type === "bar" ? (
            <Bar
              key={s.key}
              yAxisId={s.yAxisId ?? "left"}
              dataKey={s.key}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
            />
          ) : (
            <Line
              key={s.key}
              yAxisId={s.yAxisId ?? "left"}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
