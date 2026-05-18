import {
  pgTable,
  bigserial,
  bigint,
  date,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  timestamp,
} from "drizzle-orm/pg-core";
import { ads } from "./meta";

export const adInsightsDaily = pgTable(
  "ad_insights_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adId: bigint("ad_id", { mode: "number" })
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    cpm: numeric("cpm", { precision: 14, scale: 4 }),
    ctr: numeric("ctr", { precision: 8, scale: 4 }),
    reach: integer("reach"),
    frequency: numeric("frequency", { precision: 8, scale: 4 }),
    linkClicks: integer("link_clicks"),
    videoViews: integer("video_views"),
    videoP3s: integer("video_p3s"),
    videoP25: integer("video_p25"),
    videoP50: integer("video_p50"),
    videoP75: integer("video_p75"),
    videoP95: integer("video_p95"),
    conversions:
      jsonb("conversions").$type<Record<string, number>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ad_insights_daily_ad_date_uq").on(t.adId, t.date),
    index("ad_insights_daily_date_idx").on(t.date),
  ],
);
