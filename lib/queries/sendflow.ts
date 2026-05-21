/**
 * Queries da integração SendFlow (REST sync diário).
 *
 * Diferente de lib/queries/whatsapp.ts (que agrega webhook events por
 * grupo/membro), aqui é o snapshot oficial do SendFlow:
 * - whatsapp_groups.participantsAmount (membros agora, vindo da API)
 * - sendflow_analytics_daily (adds/removals/clicks agregado pelo SendFlow)
 *
 * Pra dashboard semanal/mensal, os agregados oficiais são mais confiáveis
 * que reconstruir via eventos (que dependem do webhook estar ativo).
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappGroups } from "@/lib/schema/whatsapp";
import { sendflowReleases, sendflowAnalyticsDaily } from "@/lib/schema/sendflow";
import type { DateRange } from "./dashboard";

export interface SendflowGroupRow {
  externalId: string;
  name: string | null;
  participantsAmount: number | null;
  isFull: boolean | null;
  inviteCode: string | null;
}

export interface SendflowDailyPoint {
  date: string; // YYYY-MM-DD
  adds: number;
  removals: number;
  clicks: number;
}

export interface SendflowGroupSummary {
  releaseName: string | null;
  totalGroups: number;
  totalMembers: number;
  totalCapacityKnown: boolean; // true se conseguimos calcular capacidade total
  fullGroupsCount: number;
  addsInPeriod: number;
  removalsInPeriod: number;
  clicksInPeriod: number;
  /** Conversão click → entrada no período (% — adds / clicks). null se clicks=0. */
  clickToJoinRate: number | null;
  groups: SendflowGroupRow[];
  daily: SendflowDailyPoint[];
}

/**
 * Resumo da release principal (no MVP, só a CAPTAÇÃO do Desafio — config via
 * env SENDFLOW_RELEASE_IDS no sync). Se múltiplas releases existirem, escolhe
 * a primeira não-arquivada.
 */
export async function getSendflowGroupSummary(
  range: DateRange,
): Promise<SendflowGroupSummary> {
  // 1) Release ativa (a única que sincronizamos)
  const [release] = await db
    .select({
      id: sendflowReleases.id,
      externalId: sendflowReleases.externalId,
      name: sendflowReleases.name,
    })
    .from(sendflowReleases)
    .where(eq(sendflowReleases.archived, false))
    .limit(1);

  if (!release) {
    return emptyResult(null);
  }

  // 2) Grupos da release
  const groupRows = await db
    .select({
      externalId: whatsappGroups.externalId,
      name: whatsappGroups.name,
      participantsAmount: whatsappGroups.participantsAmount,
      isFull: whatsappGroups.isFull,
      inviteCode: whatsappGroups.inviteCode,
    })
    .from(whatsappGroups)
    .where(eq(whatsappGroups.sendflowReleaseExternalId, release.externalId));

  // 3) Analytics diárias no período
  const dailyRows = await db
    .select({
      date: sendflowAnalyticsDaily.date,
      adds: sendflowAnalyticsDaily.adds,
      removals: sendflowAnalyticsDaily.removals,
      clicks: sendflowAnalyticsDaily.clicks,
    })
    .from(sendflowAnalyticsDaily)
    .where(
      and(
        eq(sendflowAnalyticsDaily.releaseId, release.id),
        gte(sendflowAnalyticsDaily.date, range.from),
        lte(sendflowAnalyticsDaily.date, range.to),
      ),
    )
    .orderBy(asc(sendflowAnalyticsDaily.date));

  const totalMembers = groupRows.reduce(
    (s, g) => s + (g.participantsAmount ?? 0),
    0,
  );
  const fullGroupsCount = groupRows.filter((g) => g.isFull).length;
  const addsInPeriod = dailyRows.reduce((s, r) => s + r.adds, 0);
  const removalsInPeriod = dailyRows.reduce((s, r) => s + r.removals, 0);
  const clicksInPeriod = dailyRows.reduce((s, r) => s + r.clicks, 0);

  return {
    releaseName: release.name,
    totalGroups: groupRows.length,
    totalMembers,
    totalCapacityKnown: groupRows.every((g) => g.participantsAmount !== null),
    fullGroupsCount,
    addsInPeriod,
    removalsInPeriod,
    clicksInPeriod,
    clickToJoinRate: clicksInPeriod > 0 ? (addsInPeriod / clicksInPeriod) * 100 : null,
    groups: groupRows.sort(
      (a, b) => (b.participantsAmount ?? 0) - (a.participantsAmount ?? 0),
    ),
    daily: dailyRows.map((r) => ({
      date: r.date,
      adds: r.adds,
      removals: r.removals,
      clicks: r.clicks,
    })),
  };
}

function emptyResult(releaseName: string | null): SendflowGroupSummary {
  return {
    releaseName,
    totalGroups: 0,
    totalMembers: 0,
    totalCapacityKnown: false,
    fullGroupsCount: 0,
    addsInPeriod: 0,
    removalsInPeriod: 0,
    clicksInPeriod: 0,
    clickToJoinRate: null,
    groups: [],
    daily: [],
  };
}

