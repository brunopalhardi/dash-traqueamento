"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmt } from "./format";
import type { WhatsappSummary } from "@/lib/queries/whatsapp";

interface Props {
  data: WhatsappSummary;
}

export function GroupPanel({ data }: Props) {
  if (data.totalGroups === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum grupo de WhatsApp conectado ainda. Configura o webhook no
          SendFlow apontando pra{" "}
          <code className="text-primary text-xs">
            /api/webhooks/sendflow?token=…
          </code>{" "}
          que os eventos começam a chegar.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Coluna 1: KPIs + lista de grupos */}
      <div className="lg:col-span-1 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Membros atuais
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {fmt.int(data.totalCurrentMembers)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              em {data.totalGroups} grupo{data.totalGroups > 1 ? "s" : ""}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Entradas / saídas
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
              +{fmt.int(data.joinedInPeriod)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              <span className="text-red-400">−{fmt.int(data.leftInPeriod)}</span>{" "}
              · líquido{" "}
              <span className="text-foreground tabular-nums">
                {data.joinedInPeriod - data.leftInPeriod >= 0 ? "+" : ""}
                {fmt.int(data.joinedInPeriod - data.leftInPeriod)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-4 flex-1 overflow-hidden">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Grupos
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {data.groups.map((g) => (
              <div
                key={g.groupExternalId}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">
                    {g.groupName ??
                      `Grupo ${g.groupExternalId.slice(0, 8)}…`}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {g.productSlug ?? "sem produto"}
                    {g.cycleLabel ? ` · ${g.cycleLabel}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold tabular-nums">
                    {fmt.int(g.currentMembers)}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    <span className="text-emerald-400">
                      +{fmt.int(g.joinedInPeriod)}
                    </span>
                    {" / "}
                    <span className="text-red-400">
                      −{fmt.int(g.leftInPeriod)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Coluna 2-3: evolução diária */}
      <div className="lg:col-span-2 rounded-lg border border-border/60 bg-card p-5">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
          Evolução diária — entradas vs saídas
        </div>
        {data.daily.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            Sem eventos no período.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.daily}
              margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => fmt.shortDate(v)}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.21 0.006 60)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => fmt.shortDate(v as string)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar
                dataKey="joined"
                name="Entraram"
                fill="#34d399"
                radius={[3, 3, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                dataKey="left"
                name="Saíram"
                fill="#f87171"
                radius={[3, 3, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
