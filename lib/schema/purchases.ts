import {
  pgTable,
  bigserial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Compras vindas do webhook do Hotmart.
 *
 * - transaction_id é UNIQUE pra idempotência (Hotmart faz retry).
 * - buyer_phone_e164 é normalizado via lib/utils/phone.ts (formato 55XXXXXXXXXXX)
 *   pra match com whatsapp_group_members.phone_normalized.
 * - status reflete o último evento processado: approved, refunded, chargeback.
 * - raw_payload sempre persistido pra debug (mesmo se parser falhar parcial).
 * ──────────────────────────────────────────────────────────────────────── */
export const purchases = pgTable(
  "purchases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    transactionId: text("transaction_id").notNull(),
    productSlug: text("product_slug").notNull(),
    productNameRaw: text("product_name_raw"),
    status: text("status").notNull(),
    buyerName: text("buyer_name"),
    buyerEmail: text("buyer_email"),
    buyerPhoneRaw: text("buyer_phone_raw"),
    buyerPhoneE164: text("buyer_phone_e164"),
    valueCents: integer("value_cents"),
    currency: text("currency"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchases_transaction_id_uq").on(t.transactionId),
    index("purchases_phone_idx").on(t.buyerPhoneE164),
    index("purchases_product_date_idx").on(t.productSlug, t.purchasedAt),
    index("purchases_status_idx").on(t.status),
  ],
);
