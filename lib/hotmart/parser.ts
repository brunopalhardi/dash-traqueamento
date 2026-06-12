import { normalizePhone } from "@/lib/utils/phone";
import { classifyPurchaseProduct, type ProductSlug } from "@/lib/products";
import { extractTracking, classifyTraffic } from "./tracking";

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
  trafficSource: "trafego" | "organico" | "sem_atribuicao";
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  adExternalId: string | null;
  trackingRaw: string | null;
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
  const productId = product ? pick<string | number>(product, ["id", "product_id"]) ?? null : null;
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

  // Webhook: raw = body completo, com data.purchase.origin.{sck,xcod}.
  // No caminho do histórico, parseSalesHistoryItem reescreve estes campos a
  // partir do item cru (ver parser-history.ts), porque o envelope sintético
  // não bate o shape esperado pelo extractTracking.
  const tracking = extractTracking(raw);
  const trafficSource = classifyTraffic(tracking);

  return {
    event,
    status: EVENT_TO_STATUS[event],
    transactionId: String(transactionId),
    productSlug: classifyPurchaseProduct(productId != null ? String(productId) : null, productName),
    productNameRaw: productName,
    buyerName,
    buyerEmail,
    buyerPhoneRaw,
    buyerPhoneE164: normalizePhone(buyerPhoneRaw),
    valueCents: valueCents != null && Number.isFinite(valueCents) ? valueCents : null,
    currency,
    purchasedAt,
    trafficSource,
    utmSource: tracking.utmSource,
    utmMedium: tracking.utmMedium,
    utmCampaign: tracking.utmCampaign,
    utmContent: tracking.utmContent,
    adExternalId: tracking.adExternalId,
    trackingRaw: tracking.trackingRaw,
  };
}
