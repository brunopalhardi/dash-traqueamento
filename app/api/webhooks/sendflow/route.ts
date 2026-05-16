/**
 * Webhook do SendFlow — recebe eventos de entrada/saída de grupos de WhatsApp.
 *
 * Configuração no painel SendFlow:
 *   URL: https://dash-traqueamento.vercel.app/api/webhooks/sendflow?token=<SENDFLOW_WEBHOOK_TOKEN>
 *   Método: POST (assumido pelo painel)
 *
 * Auth aceita o token em duas formas (qualquer uma vale):
 *   - query string ?token=...
 *   - header Authorization: Bearer ...
 *
 * O payload exato do SendFlow não está documentado abertamente — fazemos
 * parse defensivo aceitando várias chaves comuns. O raw_payload sempre é
 * persistido em whatsapp_group_events.raw_payload pra debug e replay.
 * Quando Bruno mandar um payload real, ajustamos o parser sem alterar
 * o schema.
 *
 * GET na mesma URL retorna 200 com status — útil pro SendFlow validar
 * a URL no momento do cadastro.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  whatsappGroupEvents,
  whatsappGroupMembers,
  whatsappGroups,
} from "@/lib/schema/whatsapp";
import { normalizePhone } from "@/lib/utils/phone";

export const dynamic = "force-dynamic";

type EventType = "joined" | "left" | "unknown";

interface ParsedEvent {
  groupExternalId: string;
  groupName: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  contactName: string | null;
  eventType: EventType;
  occurredAt: Date;
}

function tokenFromRequest(req: NextRequest): string | null {
  const fromQuery = req.nextUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1];
  }
  return req.headers.get("x-webhook-token");
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function classifyEvent(value: string | undefined): EventType {
  if (!value) return "unknown";
  const v = value.toLowerCase();
  if (
    [
      "joined",
      "join",
      "join_group",
      "group_join",
      "member_added",
      "added",
      "entered",
      "entrou",
      "entrada",
      "add",
    ].includes(v)
  )
    return "joined";
  if (
    [
      "left",
      "leave",
      "leave_group",
      "group_leave",
      "member_removed",
      "removed",
      "exited",
      "saiu",
      "saida",
      "saída",
      "remove",
      "kicked",
    ].includes(v)
  )
    return "left";
  return "unknown";
}

function toDate(value: unknown): Date {
  if (!value) return new Date();
  if (typeof value === "number") {
    // SendFlow pode mandar epoch em segundos ou ms — heurística
    return value > 1e12 ? new Date(value) : new Date(value * 1000);
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n) && value.match(/^\d+$/)) {
      return n > 1e12 ? new Date(n) : new Date(n * 1000);
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parsePayload(raw: unknown): ParsedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;

  // Alguns serviços encapsulam em { event: {...} } ou { data: {...} } ou { payload: {...} }
  const inner =
    (root.event as Record<string, unknown> | undefined) ??
    (root.data as Record<string, unknown> | undefined) ??
    (root.payload as Record<string, unknown> | undefined) ??
    root;

  const groupId = pick<string | number>(inner, [
    "group_id",
    "groupId",
    "group_external_id",
    "external_group_id",
    "chat_id",
    "chatId",
    "group",
  ]);
  const groupName = pick<string>(inner, [
    "group_name",
    "groupName",
    "chat_name",
    "chatName",
    "name",
    "title",
  ]);
  const phoneRaw = pick<string | number>(inner, [
    "phone",
    "phone_number",
    "phoneNumber",
    "telefone",
    "whatsapp",
    "contact_phone",
    "contactPhone",
    "number",
    "msisdn",
    "wa_id",
    "waId",
  ]);
  const contactName = pick<string>(inner, [
    "contact_name",
    "contactName",
    "user_name",
    "userName",
    "first_name",
    "firstName",
    "push_name",
    "pushname",
  ]);
  const eventRaw = pick<string>(inner, [
    "event",
    "event_type",
    "eventType",
    "type",
    "action",
    "status",
  ]);
  const occurredAtRaw = pick<string | number>(inner, [
    "occurred_at",
    "occurredAt",
    "timestamp",
    "time",
    "datetime",
    "created_at",
    "createdAt",
  ]);

  if (!groupId) return null;

  const phoneNormalized = normalizePhone(
    phoneRaw != null ? String(phoneRaw) : undefined,
  );

  return {
    groupExternalId: String(groupId),
    groupName: groupName ? String(groupName) : null,
    phoneRaw: phoneRaw != null ? String(phoneRaw) : null,
    phoneNormalized,
    contactName: contactName ? String(contactName) : null,
    eventType: classifyEvent(eventRaw),
    occurredAt: toDate(occurredAtRaw),
  };
}

async function upsertGroup(parsed: ParsedEvent): Promise<number> {
  const existing = await db
    .select({ id: whatsappGroups.id })
    .from(whatsappGroups)
    .where(eq(whatsappGroups.externalId, parsed.groupExternalId))
    .limit(1);

  if (existing[0]) {
    if (parsed.groupName) {
      await db
        .update(whatsappGroups)
        .set({ name: parsed.groupName, updatedAt: new Date() })
        .where(eq(whatsappGroups.id, existing[0].id));
    }
    return existing[0].id;
  }

  const [inserted] = await db
    .insert(whatsappGroups)
    .values({
      externalId: parsed.groupExternalId,
      name: parsed.groupName,
    })
    .returning({ id: whatsappGroups.id });
  return inserted.id;
}

async function applyMemberState(
  groupId: number,
  parsed: ParsedEvent,
): Promise<void> {
  if (!parsed.phoneNormalized) return;
  const inGroup = parsed.eventType === "joined";
  const now = new Date();

  await db
    .insert(whatsappGroupMembers)
    .values({
      groupId,
      groupExternalId: parsed.groupExternalId,
      phoneNormalized: parsed.phoneNormalized,
      name: parsed.contactName,
      firstJoinedAt: inGroup ? parsed.occurredAt : null,
      lastEventAt: parsed.occurredAt,
      lastEventType: parsed.eventType,
      currentlyInGroup: inGroup,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        whatsappGroupMembers.groupExternalId,
        whatsappGroupMembers.phoneNormalized,
      ],
      // Só sobrescreve estado se o evento novo é mais recente. Eventos
      // fora de ordem (replay, race) não fazem regredir o currently_in_group.
      set: {
        name: sql`coalesce(excluded.name, ${whatsappGroupMembers.name})`,
        firstJoinedAt: sql`coalesce(${whatsappGroupMembers.firstJoinedAt}, ${inGroup ? parsed.occurredAt : null})`,
        lastEventAt: sql`greatest(${whatsappGroupMembers.lastEventAt}, ${parsed.occurredAt})`,
        lastEventType: sql`case when ${parsed.occurredAt} >= ${whatsappGroupMembers.lastEventAt}
          then ${parsed.eventType}::whatsapp_event_type
          else ${whatsappGroupMembers.lastEventType} end`,
        currentlyInGroup: sql`case when ${parsed.occurredAt} >= ${whatsappGroupMembers.lastEventAt}
          then ${inGroup}
          else ${whatsappGroupMembers.currentlyInGroup} end`,
        updatedAt: now,
      },
    });
}

export async function GET(req: NextRequest) {
  const ok = req.nextUrl.searchParams.get("token") === process.env.SENDFLOW_WEBHOOK_TOKEN;
  return NextResponse.json({
    ok: true,
    service: "sendflow-webhook",
    authenticated: ok,
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.SENDFLOW_WEBHOOK_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "SENDFLOW_WEBHOOK_TOKEN não configurado no servidor" },
      { status: 503 },
    );
  }
  if (tokenFromRequest(req) !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // SendFlow pode mandar batch (array) ou evento único — normaliza pra array
  const items = Array.isArray(raw) ? raw : [raw];
  const results: Array<{ ok: boolean; reason?: string; eventId?: number }> = [];

  for (const item of items) {
    const parsed = parsePayload(item);
    if (!parsed) {
      // Persiste mesmo sem conseguir parsear, pra debug
      console.warn("[sendflow] payload sem group_id reconhecido", item);
      results.push({ ok: false, reason: "unparseable" });
      continue;
    }

    const groupId = await upsertGroup(parsed);

    const [event] = await db
      .insert(whatsappGroupEvents)
      .values({
        groupExternalId: parsed.groupExternalId,
        groupName: parsed.groupName,
        phoneNormalized: parsed.phoneNormalized,
        rawPhone: parsed.phoneRaw,
        contactName: parsed.contactName,
        eventType: parsed.eventType,
        occurredAt: parsed.occurredAt,
        rawPayload: item as object,
      })
      .returning({ id: whatsappGroupEvents.id });

    await applyMemberState(groupId, parsed);

    results.push({ ok: true, eventId: event.id });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
