import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  jsonb,
  boolean,
  date,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Releases (campanhas) do SendFlow.
 *
 * Cada release agrupa múltiplos grupos de WhatsApp (ex: "LC16 - DO CAOS A
 * CALMA" tem 30+ grupos). external_id é o ID Firebase do SendFlow
 * (ex: "0016PzrvpbQwriIJEvmx"), populado via GET /releases.
 * ──────────────────────────────────────────────────────────────────────── */
export const sendflowReleases = pgTable(
  "sendflow_releases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** ID do SendFlow (Firebase-like, ex: 0016PzrvpbQwriIJEvmx) */
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    archived: boolean("archived").notNull().default(false),
    /** Payload bruto pra debug/futura expansão (admins, group config, etc) */
    rawPayload: jsonb("raw_payload"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sendflow_releases_external_id_uq").on(t.externalId),
    index("sendflow_releases_archived_idx").on(t.archived),
  ],
);

/* ────────────────────────────────────────────────────────────────────────
 * Analytics diárias por release (adds/removals/clicks).
 *
 * GET /releases/{id}/analytics devolve `{ add: { dates: {DDMMYYYY: N} },
 * remove: {...}, clicks: {...} }`. A gente desnormaliza pra (release, date)
 * com colunas separadas — facilita query "evolução de X últimos dias".
 *
 * Upsert por (release_id, date) — sync diário re-baixa o histórico inteiro
 * e idempotentemente atualiza. SendFlow não tem versionamento, então
 * a estratégia é "sempre confiar no último GET".
 * ──────────────────────────────────────────────────────────────────────── */
export const sendflowAnalyticsDaily = pgTable(
  "sendflow_analytics_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    releaseId: bigint("release_id", { mode: "number" })
      .notNull()
      .references(() => sendflowReleases.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    adds: integer("adds").notNull().default(0),
    removals: integer("removals").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sendflow_analytics_daily_release_date_uq").on(
      t.releaseId,
      t.date,
    ),
    index("sendflow_analytics_daily_date_idx").on(t.date),
  ],
);
