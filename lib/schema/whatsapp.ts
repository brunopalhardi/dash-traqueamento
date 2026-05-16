import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  jsonb,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const whatsappEventType = pgEnum("whatsapp_event_type", [
  "joined",
  "left",
  "unknown",
]);

/* ────────────────────────────────────────────────────────────────────────
 * Grupo de WhatsApp gerenciado pelo SendFlow.
 *
 * Como a UI do SendFlow ainda não tá conectada, esses rows podem aparecer
 * automaticamente (ao receber o primeiro evento de um group_external_id
 * novo) e Bruno depois preenche product_slug + cycle_label via SQL pra
 * associar o grupo a um produto/ciclo.
 * ──────────────────────────────────────────────────────────────────────── */
export const whatsappGroups = pgTable(
  "whatsapp_groups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** ID do grupo no SendFlow (ou nome se não houver ID) */
    externalId: text("external_id").notNull(),
    name: text("name"),
    /** Slug do produto (desafio / c1 / sono / guia) — opcional, Bruno preenche */
    productSlug: text("product_slug"),
    /** Identificador do ciclo (ex.: "2026-05") — opcional */
    cycleLabel: text("cycle_label"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("whatsapp_groups_external_id_uq").on(t.externalId),
    index("whatsapp_groups_product_idx").on(t.productSlug),
  ],
);

/* ────────────────────────────────────────────────────────────────────────
 * Cada evento bruto de entrada/saída disparado pelo SendFlow.
 * Mantemos o raw_payload pra debug / replay.
 * ──────────────────────────────────────────────────────────────────────── */
export const whatsappGroupEvents = pgTable(
  "whatsapp_group_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Espelhado em string pra eventos chegarem mesmo sem row em whatsapp_groups ainda */
    groupExternalId: text("group_external_id").notNull(),
    groupName: text("group_name"),
    phoneNormalized: text("phone_normalized"),
    rawPhone: text("raw_phone"),
    contactName: text("contact_name"),
    eventType: whatsappEventType("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawPayload: jsonb("raw_payload").notNull(),
  },
  (t) => [
    index("whatsapp_group_events_group_idx").on(t.groupExternalId),
    index("whatsapp_group_events_phone_idx").on(t.phoneNormalized),
    index("whatsapp_group_events_occurred_idx").on(t.occurredAt),
  ],
);

/* ────────────────────────────────────────────────────────────────────────
 * Estado corrente de cada (grupo, telefone). Atualizado pelo webhook
 * baseado no último evento. currently_in_group = último evento foi joined.
 * ──────────────────────────────────────────────────────────────────────── */
export const whatsappGroupMembers = pgTable(
  "whatsapp_group_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupId: bigint("group_id", { mode: "number" })
      .notNull()
      .references(() => whatsappGroups.id, { onDelete: "cascade" }),
    groupExternalId: text("group_external_id").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),
    name: text("name"),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    lastEventType: whatsappEventType("last_event_type").notNull(),
    currentlyInGroup: boolean("currently_in_group").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("whatsapp_group_members_group_phone_uq").on(
      t.groupExternalId,
      t.phoneNormalized,
    ),
    index("whatsapp_group_members_phone_idx").on(t.phoneNormalized),
    index("whatsapp_group_members_group_idx").on(t.groupId),
  ],
);
