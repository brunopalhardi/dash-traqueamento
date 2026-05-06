import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  pgEnum,
  integer,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { adAccounts } from "./meta";

export const syncJobType = pgEnum("sync_job_type", [
  "meta_full",
  "meta_incremental",
  "hotmart_replay",
  "match_recompute",
  "ping",
]);

export const syncJobStatus = pgEnum("sync_job_status", [
  "queued",
  "running",
  "done",
  "failed",
]);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: syncJobType("type").notNull(),
    adAccountId: bigint("ad_account_id", { mode: "number" }).references(
      () => adAccounts.id,
      { onDelete: "cascade" },
    ),
    status: syncJobStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rowsProcessed: integer("rows_processed").default(0),
    errorMessage: text("error_message"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sync_jobs_type_idx").on(t.type),
    index("sync_jobs_status_idx").on(t.status),
    index("sync_jobs_created_at_idx").on(t.createdAt),
  ],
);
