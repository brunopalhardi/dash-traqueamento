import {
  pgTable,
  bigserial,
  text,
  timestamp,
  bigint,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const adAccountStatus = pgEnum("ad_account_status", [
  "active",
  "paused",
  "disabled",
  "error",
]);

export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    metaAccountId: text("meta_account_id").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    isActive: boolean("is_active").notNull().default(false),
    currency: text("currency").notNull().default("BRL"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    status: adAccountStatus("status").notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ad_accounts_meta_id_uq").on(t.metaAccountId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adAccountId: bigint("ad_account_id", { mode: "number" })
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status").notNull(),
    dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }),
    lifetimeBudget: numeric("lifetime_budget", { precision: 14, scale: 2 }),
    startTime: timestamp("start_time", { withTimezone: true }),
    stopTime: timestamp("stop_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("campaigns_meta_id_uq").on(t.metaId),
    index("campaigns_account_idx").on(t.adAccountId),
  ],
);

export const adsets = pgTable(
  "adsets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    campaignId: bigint("campaign_id", { mode: "number" })
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }),
    targeting: jsonb("targeting").$type<Record<string, unknown>>(),
    optimizationGoal: text("optimization_goal"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("adsets_meta_id_uq").on(t.metaId),
    index("adsets_campaign_idx").on(t.campaignId),
  ],
);

export const creativeType = pgEnum("creative_type", [
  "image",
  "video",
  "carousel",
  "other",
]);

export const creatives = pgTable(
  "creatives",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metaId: text("meta_id").notNull(),
    name: text("name"),
    type: creativeType("type").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    videoUrl: text("video_url"),
    headline: text("headline"),
    body: text("body"),
    callToAction: text("call_to_action"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("creatives_meta_id_uq").on(t.metaId)],
);

export const ads = pgTable(
  "ads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adsetId: bigint("adset_id", { mode: "number" })
      .notNull()
      .references(() => adsets.id, { onDelete: "cascade" }),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    creativeId: bigint("creative_id", { mode: "number" }).references(
      () => creatives.id,
      { onDelete: "set null" },
    ),
    previewUrl: text("preview_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ads_meta_id_uq").on(t.metaId),
    index("ads_adset_idx").on(t.adsetId),
  ],
);

// Relations
export const adAccountsRelations = relations(adAccounts, ({ many }) => ({
  campaigns: many(campaigns),
}));
export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  adAccount: one(adAccounts, {
    fields: [campaigns.adAccountId],
    references: [adAccounts.id],
  }),
  adsets: many(adsets),
}));
export const adsetsRelations = relations(adsets, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [adsets.campaignId],
    references: [campaigns.id],
  }),
  ads: many(ads),
}));
export const adsRelations = relations(ads, ({ one }) => ({
  adset: one(adsets, { fields: [ads.adsetId], references: [adsets.id] }),
  creative: one(creatives, {
    fields: [ads.creativeId],
    references: [creatives.id],
  }),
}));
