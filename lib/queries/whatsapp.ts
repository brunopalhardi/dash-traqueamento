/**
 * Queries de grupos de WhatsApp (SendFlow).
 *
 * O painel mostra eventos do período do ciclo agregados por grupo.
 * Filtramos por slug do produto via `whatsapp_groups.product_slug` quando
 * configurado; senão mostra todos os grupos (Bruno preenche product_slug
 * via SQL ou futura UI).
 */
import { and, eq, gte, inArray, lte, sql, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  whatsappGroups,
  whatsappGroupEvents,
  whatsappGroupMembers,
} from "@/lib/schema/whatsapp";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

export interface GroupSummaryRow {
  groupExternalId: string;
  groupName: string | null;
  productSlug: string | null;
  cycleLabel: string | null;
  currentMembers: number;
  joinedInPeriod: number;
  leftInPeriod: number;
}

export interface WhatsappSummary {
  totalGroups: number;
  totalCurrentMembers: number;
  joinedInPeriod: number;
  leftInPeriod: number;
  groups: GroupSummaryRow[];
  daily: Array<{ date: string; joined: number; left: number }>;
}

function groupFilter(slug: ProductSlug) {
  // Pra slug "geral", não filtra — mostra todos os grupos
  if (slug === "geral") return undefined;
  // Match em product_slug exato OU no nome do grupo (case-insensitive)
  return or(
    eq(whatsappGroups.productSlug, slug),
    ilike(whatsappGroups.name, `%${slug}%`),
  );
}

export async function getWhatsappSummary(
  slug: ProductSlug,
  range: DateRange,
): Promise<WhatsappSummary> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");

  // 1) Grupos que casam com o produto
  const groupConds = [];
  const gFilter = groupFilter(slug);
  if (gFilter) groupConds.push(gFilter);

  const groupRows = await db
    .select({
      id: whatsappGroups.id,
      externalId: whatsappGroups.externalId,
      name: whatsappGroups.name,
      productSlug: whatsappGroups.productSlug,
      cycleLabel: whatsappGroups.cycleLabel,
    })
    .from(whatsappGroups)
    .where(groupConds.length ? and(...groupConds) : undefined);

  if (groupRows.length === 0) {
    return {
      totalGroups: 0,
      totalCurrentMembers: 0,
      joinedInPeriod: 0,
      leftInPeriod: 0,
      groups: [],
      daily: [],
    };
  }

  const externalIds = groupRows.map((g) => g.externalId);

  // 2) Membros atualmente no grupo (snapshot)
  const memberCounts = await db
    .select({
      groupExternalId: whatsappGroupMembers.groupExternalId,
      count: sql<number>`count(*) filter (where ${whatsappGroupMembers.currentlyInGroup})::int`,
    })
    .from(whatsappGroupMembers)
    .where(inArray(whatsappGroupMembers.groupExternalId, externalIds))
    .groupBy(whatsappGroupMembers.groupExternalId);

  const memberCountByGroup = new Map(
    memberCounts.map((r) => [r.groupExternalId, Number(r.count)]),
  );

  // 3) Eventos no período (joined/left por grupo)
  const eventCounts = await db
    .select({
      groupExternalId: whatsappGroupEvents.groupExternalId,
      joined: sql<number>`count(*) filter (where ${whatsappGroupEvents.eventType} = 'joined')::int`,
      left: sql<number>`count(*) filter (where ${whatsappGroupEvents.eventType} = 'left')::int`,
    })
    .from(whatsappGroupEvents)
    .where(
      and(
        inArray(whatsappGroupEvents.groupExternalId, externalIds),
        gte(whatsappGroupEvents.occurredAt, from),
        lte(whatsappGroupEvents.occurredAt, to),
      ),
    )
    .groupBy(whatsappGroupEvents.groupExternalId);

  const eventByGroup = new Map(
    eventCounts.map((r) => [
      r.groupExternalId,
      { joined: Number(r.joined), left: Number(r.left) },
    ]),
  );

  // 4) Evolução diária agregada (todos os grupos do produto)
  const dailyRows = await db
    .select({
      date: sql<string>`to_char(${whatsappGroupEvents.occurredAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      joined: sql<number>`count(*) filter (where ${whatsappGroupEvents.eventType} = 'joined')::int`,
      left: sql<number>`count(*) filter (where ${whatsappGroupEvents.eventType} = 'left')::int`,
    })
    .from(whatsappGroupEvents)
    .where(
      and(
        inArray(whatsappGroupEvents.groupExternalId, externalIds),
        gte(whatsappGroupEvents.occurredAt, from),
        lte(whatsappGroupEvents.occurredAt, to),
      ),
    )
    .groupBy(
      sql`to_char(${whatsappGroupEvents.occurredAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(${whatsappGroupEvents.occurredAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    );

  const groups: GroupSummaryRow[] = groupRows
    .map((g) => {
      const ev = eventByGroup.get(g.externalId) ?? { joined: 0, left: 0 };
      return {
        groupExternalId: g.externalId,
        groupName: g.name,
        productSlug: g.productSlug,
        cycleLabel: g.cycleLabel,
        currentMembers: memberCountByGroup.get(g.externalId) ?? 0,
        joinedInPeriod: ev.joined,
        leftInPeriod: ev.left,
      };
    })
    .sort((a, b) => b.currentMembers - a.currentMembers);

  return {
    totalGroups: groups.length,
    totalCurrentMembers: groups.reduce((s, g) => s + g.currentMembers, 0),
    joinedInPeriod: groups.reduce((s, g) => s + g.joinedInPeriod, 0),
    leftInPeriod: groups.reduce((s, g) => s + g.leftInPeriod, 0),
    groups,
    daily: dailyRows.map((r) => ({
      date: r.date,
      joined: Number(r.joined),
      left: Number(r.left),
    })),
  };
}
