import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ads } from "./meta";

export const leadSource = pgEnum("lead_source", [
  "meta",
  "organic",
  "unknown",
]);

export const leads = pgTable(
  "leads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    emailNormalized: text("email_normalized"),
    phoneNormalized: text("phone_normalized"),
    name: text("name"),
    source: leadSource("source").notNull().default("unknown"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    fbclid: text("fbclid"),
    fbpCookie: text("fbp_cookie"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    adId: bigint("ad_id", { mode: "number" }).references(() => ads.id, {
      onDelete: "set null",
    }),
    landingUrl: text("landing_url"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_email_idx").on(t.emailNormalized),
    index("leads_phone_idx").on(t.phoneNormalized),
    index("leads_captured_at_idx").on(t.capturedAt),
    index("leads_ad_idx").on(t.adId),
  ],
);

export const saleStatus = pgEnum("sale_status", [
  "approved",
  "refunded",
  "chargeback",
  "pending",
  "canceled",
]);

export const sales = pgTable(
  "sales",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hotmartTransactionId: text("hotmart_transaction_id").notNull(),
    status: saleStatus("status").notNull(),
    buyerEmailNormalized: text("buyer_email_normalized"),
    buyerPhoneNormalized: text("buyer_phone_normalized"),
    buyerName: text("buyer_name"),
    productId: text("product_id"),
    productName: text("product_name"),
    offerCode: text("offer_code"),
    amountBrl: numeric("amount_brl", { precision: 14, scale: 2 }),
    paymentMethod: text("payment_method"),
    currency: text("currency").notNull().default("BRL"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sales_transaction_uq").on(t.hotmartTransactionId),
    index("sales_email_idx").on(t.buyerEmailNormalized),
    index("sales_phone_idx").on(t.buyerPhoneNormalized),
    index("sales_purchased_at_idx").on(t.purchasedAt),
  ],
);

export const matchMethod = pgEnum("match_method", ["email", "phone"]);
export const matchConfidence = pgEnum("match_confidence", [
  "high",
  "medium",
  "low",
]);

export const leadSaleMatches = pgTable(
  "lead_sale_matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leadId: bigint("lead_id", { mode: "number" })
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    saleId: bigint("sale_id", { mode: "number" })
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    matchMethod: matchMethod("match_method").notNull(),
    confidence: matchConfidence("confidence").notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_sale_uq").on(t.leadId, t.saleId),
    index("lead_sale_lead_idx").on(t.leadId),
    index("lead_sale_sale_idx").on(t.saleId),
  ],
);
