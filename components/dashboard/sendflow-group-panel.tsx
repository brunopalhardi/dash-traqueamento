"use client";

import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExternalLink, Users, MousePointerClick, UserPlus } from "lucide-react";
import { fmt } from "./format";
import type { SendflowGroupSummary } from "@/lib/queries/sendflow";

interface Props {
  data: SendflowGroupSummary;
}

export function SendflowGroupPanel({ data }: Props) {
  if (data.totalGroups === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum grupo encontrado pra release ativa. Verifica se o sync diário
          do SendFlow rodou em <code className="text-primary text-xs">/api/sync/sendflow</code>.
        </p>
      </div>
    );
  }

  const netInPeriod = data.addsInPeriod - data.removalsInPeriod;
  const netPositive = netInPeriod >= 0;

  return (
    <div className="space-y-4">
      {/* Header da release */}
      {data.releaseName ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase tracking-[0.12em]">Campanha</span>
          <span className="text-foreground font-medium normal-case tracking-normal">
            {data.releaseName}
          </span>
        </div>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Membros ativos"
          value={fmt.int(data.totalMembers)}
          sub={`${data.totalGroups} grupo${data.totalGroups > 1 ? "s" : ""}${
            data.fullGroupsCount > 0
              ? ` · ${data.fullGroupsCount} cheio${data.fullGroupsCount > 1 ? "s" : ""}`
              : ""
          }`}
        />
        <KpiCard
          icon={<UserPlus className="h-3.5 w-3.5 text-emerald-400" />}
          label="Entraram no período"
          value={`+${fmt.int(data.addsInPeriod)}`}
          sub={
            <span>
              <span className="text-rose-400">−{fmt.int(data.removalsInPeriod)}</span>
              {" · líquido "}
              <span className={netPositive ? "text-emerald-400" : "text-rose-400"}>
                {netPositive ? "+" : ""}
                {fmt.int(netInPeriod)}
              </span>
            </span>
          }
        />
        <KpiCard
          icon={<MousePointerClick className="h-3.5 w-3.5 text-sky-400" />}
          label="Cliques no convite"
          value={fmt.int(data.clicksInPeriod)}
          sub="link → grupo"
        />
        <KpiCard
          icon={<UserPlus className="h-3.5 w-3.5 text-amber-400" />}
          label="Conversão clique → entrada"
          value={
            data.clickToJoinRate !== null
              ? `${data.clickToJoinRate.toFixed(1)}%`
              : "—"
          }
          sub={
            data.clickToJoinRate !== null
              ? `${fmt.int(data.addsInPeriod)} de ${fmt.int(data.clicksInPeriod)} cliques`
              : "sem cliques no período"
          }
        />
      </div>

      {/* Grid 2/3 chart, 1/3 lista de grupos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Evolução diária — entradas / saídas / cliques
          </div>
          {data.daily.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">
              Sem dados no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart
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
                    color: "#fff",
                  }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                  labelFormatter={(v) => fmt.shortDate(v as string)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar
                  dataKey="adds"
                  name="Entraram"
                  fill="#34d399"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                />
                <Bar
                  dataKey="removals"
                  name="Saíram"
                  fill="#f87171"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name="Cliques"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-5 flex flex-col">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Grupos
          </div>
          <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
            {data.groups.map((g) => (
              <div
                key={g.externalId}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">
                    {g.name ?? `Grupo ${g.externalId.slice(0, 8)}…`}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {g.isFull ? (
                      <span className="inline-flex items-center px-1.5 py-px rounded bg-rose-500/10 text-rose-400 text-[9px] uppercase tracking-wider">
                        cheio
                      </span>
                    ) : null}
                    {g.inviteCode ? (
                      <a
                        href={`https://chat.whatsapp.com/${g.inviteCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
                      >
                        convite <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">
                    {g.participantsAmount !== null ? fmt.int(g.participantsAmount) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">membros</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground inline-flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
