import { normalizePhone } from "@/lib/utils/phone";
import { PRODUCTS, type ProductSlug } from "@/lib/products";

export interface ParsedPurchase {
  event: "PURCHASE_APPROVED" | "PURCHASE_REFUNDED" | "PURCHASE_CHARGEBACK";
  status: "approved" | "refunded" | "chargeback";
  transactionId: string;
  productSlug: ProductSlug | "outros";
  productNameRaw: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneRaw: string | null;
  buyerPhoneE164: string | null;
  valueCents: number | null;
  currency: string | null;
  purchasedAt: Date;
}

const EVENT_TO_STATUS = {
  PURCHASE_APPROVED: "approved",
  PURCHASE_REFUNDED: "refunded",
  PURCHASE_CHARGEBACK: "chargeback",
} as const;

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (typeof v === "number") return v > 1e12 ? new Date(v) : new Date(v * 1000);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && /^\d+$/.test(v)) {
      return n > 1e12 ? new Date(n) : new Date(n * 1000);
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function detectProductByName(name: string | null): ProductSlug | "outros" {
  if (!name) return "outros";
  for (const p of PRODUCTS) {
    if (p.slug === "geral" || p.slug === "lancamento") continue;
    if (p.namePattern && p.namePattern.test(name)) return p.slug;
  }
  // Fallback: keywords explícitas
  if (/desafio/i.test(name)) return "desafio";
  if (/guia/i.test(name)) return "guia";
  return "outros";
}

export function parsePurchasePayload(raw: unknown): ParsedPurchase | null {
  const root = asObj(raw);
  if (!root) return null;

  const eventStr = pick<string>(root, ["event", "event_type"]);
  if (!eventStr || !(eventStr in EVENT_TO_STATUS)) return null;
  const event = eventStr as keyof typeof EVENT_TO_STATUS;

  const data = asObj(root.data) ?? root;
  const product = asObj(data.product);
  const buyer = asObj(data.buyer);
  const purchase = asObj(data.purchase) ?? data;

  const transactionId = pick<string>(purchase, [
    "transaction",
    "transaction_id",
    "id",
  ]);
  if (!transactionId) return null;

  const productName = product ? pick<string>(product, ["name", "product_name"]) ?? null : null;
  const buyerName = buyer ? pick<string>(buyer, ["name", "buyer_name", "full_name"]) ?? null : null;
  const buyerEmail = buyer ? pick<string>(buyer, ["email", "buyer_email"]) ?? null : null;
  const buyerPhoneRaw = buyer
    ? pick<string>(buyer, ["checkout_phone", "phone", "phone_number", "telefone"]) ?? null
    : null;

  const priceObj = asObj(purchase.price);
  const valueNum =
    pick<number | string>(priceObj ?? purchase, [
      "value",
      "price",
      "amount",
      "total_value",
    ]) ?? null;
  const valueCents =
    valueNum != null ? Math.round(Number(valueNum) * 100) : null;

  const currency =
    pick<string>(priceObj ?? purchase, ["currency_value", "currency", "currency_code"]) ?? null;

  const purchasedAt = toDate(
    pick<string | number>(purchase, [
      "approved_date",
      "order_date",
      "purchase_date",
      "creation_date",
    ]),
  );

  return {
    event,
    status: EVENT_TO_STATUS[event],
    transactionId: String(transactionId),
    productSlug: detectProductByName(productName),
    productNameRaw: productName,
    buyerName,
    buyerEmail,
    buyerPhoneRaw,
    buyerPhoneE164: normalizePhone(buyerPhoneRaw),
    valueCents: valueCents != null && Number.isFinite(valueCents) ? valueCents : null,
    currency,
    purchasedAt,
  };
}
