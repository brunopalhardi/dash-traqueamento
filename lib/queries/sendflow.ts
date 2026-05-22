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
import { and, asc, desc, eq, gte, lte, ilike, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappGroups } from "@/lib/schema/whatsapp";
import { purchases } from "@/lib/schema/purchases";
import {
  sendflowReleases,
  sendflowAnalyticsDaily,
  sendflowLeadscoring,
} from "@/lib/schema/sendflow";
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

export interface SendflowTopLead {
  phone: string;
  score: number;
  rank: number;
  buyerName: string | null;
  isBuyer: boolean;
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
  /** Top engajados da release de LIVE (lib de leadscoring nativa do SendFlow).
   * Marca quem é comprador via match phone ↔ purchases.buyer_phone_e164. */
  topLeads: SendflowTopLead[];
  leadscoringReleaseName: string | null;
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

  // 2) Grupos da release — desconta admins do total
  const groupRows = await db
    .select({
      externalId: whatsappGroups.externalId,
      name: whatsappGroups.name,
      rawParticipants: whatsappGroups.participantsAmount,
      adminsCount: sql<number>`coalesce(jsonb_array_length(${whatsappGroups.admins}), 0)::int`,
      isFull: whatsappGroups.isFull,
      inviteCode: whatsappGroups.inviteCode,
    })
    .from(whatsappGroups)
    .where(eq(whatsappGroups.sendflowReleaseExternalId, release.externalId))
    .then((rows) =>
      rows.map((r) => ({
        externalId: r.externalId,
        name: r.name,
        // "Membros ativos" exclui admins — o que importa pro Bruno são os leads reais
        participantsAmount:
          r.rawParticipants !== null
            ? Math.max(0, r.rawParticipants - (r.adminsCount ?? 0))
            : null,
        isFull: r.isFull,
        inviteCode: r.inviteCode,
      })),
    );

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

  // 4) Top engajados — busca da release "LIVE" (leadscoring só faz sentido lá).
  // Se a release LIVE não existe (Bruno não rodou sync ainda), retorna [].
  const liveRelease = await db
    .select({ id: sendflowReleases.id, name: sendflowReleases.name })
    .from(sendflowReleases)
    .where(
      and(
        eq(sendflowReleases.archived, false),
        ilike(sendflowReleases.name, "%LIVE%"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  let topLeads: SendflowTopLead[] = [];
  if (liveRelease) {
    const rawTop = await db
      .select({
        phone: sendflowLeadscoring.phoneNormalized,
        score: sendflowLeadscoring.score,
        rank: sendflowLeadscoring.rank,
        buyerName: purchases.buyerName,
      })
      .from(sendflowLeadscoring)
      .leftJoin(
        purchases,
        and(
          eq(purchases.buyerPhoneE164, sendflowLeadscoring.phoneNormalized),
          eq(purchases.status, "approved"),
        ),
      )
      .where(eq(sendflowLeadscoring.releaseId, liveRelease.id))
      .orderBy(desc(sendflowLeadscoring.score))
      // 500 cobre toda a release sem custo relevante e permite que o botão
      // "Exportar CSV" leve a lista completa, enquanto a UI mostra só os 20.
      .limit(500);

    // LEFT JOIN com purchases pode duplicar leads (1 phone com várias compras).
    // De-duplica por phone, prefere row com buyer_name.
    const seen = new Map<string, SendflowTopLead>();
    for (const r of rawTop) {
      const existing = seen.get(r.phone);
      if (existing && existing.buyerName) continue;
      seen.set(r.phone, {
        phone: r.phone,
        score: r.score,
        rank: r.rank,
        buyerName: r.buyerName,
        isBuyer: r.buyerName !== null,
      });
    }
    topLeads = [...seen.values()].sort((a, b) => b.score - a.score);
  }

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
    topLeads,
    leadscoringReleaseName: liveRelease?.name ?? null,
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
    topLeads: [],
    leadscoringReleaseName: null,
  };
}

