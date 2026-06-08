import {
  pgTable, bigserial, bigint, text, integer, numeric, boolean, date, jsonb,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CurveBucket } from "@/lib/vturb/types";

export const vturbPlayers = pgTable("vturb_players", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  playerId: text("player_id").notNull().unique(),
  name: text("name"),
  durationSec: integer("duration_sec").notNull().default(0),
  pitchTimeSec: integer("pitch_time_sec").notNull().default(0),
  vturbCreatedAt: timestamp("vturb_created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vturbPages = pgTable(
  "vturb_pages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productSlug: text("product_slug").notNull().default("guia"),
    pageUrl: text("page_url").notNull(),
    rawExampleUrl: text("raw_example_url"),
    isActive: boolean("is_active").notNull().default(true),
    scrapeStatus: text("scrape_status").notNull().default("pending"),
    lastHttpStatus: integer("last_http_status"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vturb_pages_product_url_uniq").on(t.productSlug, t.pageUrl)],
);

export const vturbPagePlayers = pgTable(
  "vturb_page_players",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: bigint("page_id", { mode: "number" })
      .notNull().references(() => vturbPages.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    source: text("source").notNull().default("auto"),
  },
  (t) => [uniqueIndex("vturb_page_players_uniq").on(t.pageId, t.playerId)],
);

export const vturbPageDaily = pgTable(
  "vturb_page_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: bigint("page_id", { mode: "number" })
      .notNull().references(() => vturbPages.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    views: integer("views").notNull().default(0),
    plays: integer("plays").notNull().default(0),
    finished: integer("finished").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    overPitch: integer("over_pitch").notNull().default(0),
    underPitch: integer("under_pitch").notNull().default(0),
    avgWatchedSec: numeric("avg_watched_sec", { precision: 10, scale: 2 }).notNull().default("0"),
    engagementRate: numeric("engagement_rate", { precision: 6, scale: 2 }).notNull().default("0"),
    playRate: numeric("play_rate", { precision: 6, scale: 2 }).notNull().default("0"),
    pitchRetentionRate: numeric("pitch_retention_rate", { precision: 6, scale: 2 }),
    raw: jsonb("raw").default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vturb_page_daily_uniq").on(t.pageId, t.date)],
);

export const vturbRetentionDaily = pgTable(
  "vturb_retention_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: bigint("page_id", { mode: "number" })
      .notNull().references(() => vturbPages.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    durationSec: integer("duration_sec").notNull().default(0),
    pitchPct: numeric("pitch_pct", { precision: 6, scale: 2 }),
    curve: jsonb("curve").$type<CurveBucket[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vturb_retention_daily_uniq").on(t.pageId, t.date)],
);
