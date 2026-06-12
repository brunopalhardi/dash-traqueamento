/**
 * Adapter da Sales History API → ParsedPurchase.
 *
 * Items da sales-history têm shape { product, buyer, purchase } SEM um campo
 * `event`. O webhook parser exige `event` (porque ele que define status). Aqui
 * derivamos um `event` sintético a partir de `purchase.status` e delegamos
 * pro parser do webhook — assim toda a extração de buyer/product/price/phone
 * é reusada.
 *
 * Status não-handled (STARTED, WAITING_PAYMENT, etc.) viram null e são
 * ignorados pelo orquestrador.
 */
import { parsePurchasePayload, type ParsedPurchase } from "./parser";
import { extractTracking, classifyTraffic } from "./tracking";

const STATUS_TO_EVENT: Record<string, "PURCHASE_APPROVED" | "PURCHASE_REFUNDED" | "PURCHASE_CHARGEBACK"> = {
  APPROVED: "PURCHASE_APPROVED",
  // COMPLETE = compra finalizada (ex.: assinatura que completou ciclo). Bruno
  // pediu pra contar como venda paga junto com APPROVED.
  COMPLETE: "PURCHASE_APPROVED",
  REFUNDED: "PURCHASE_REFUNDED",
  CHARGEBACK: "PURCHASE_CHARGEBACK",
};

export function parseSalesHistoryItem(item: unknown): ParsedPurchase | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const purchase = (item as { purchase?: unknown }).purchase;
  if (!purchase || typeof purchase !== "object") return null;

  const statusRaw = (purchase as { status?: unknown }).status;
  if (typeof statusRaw !== "string") return null;

  const event = STATUS_TO_EVENT[statusRaw.toUpperCase()];
  if (!event) return null;

  // Delega pro parser do webhook com envelope sintético
  const parsed = parsePurchasePayload({ event, data: item });
  if (!parsed) return null;

  // O extractTracking dentro do parser roda sobre o envelope sintético
  // ({ event, data: item }), cujo shape NÃO bate o ramo do histórico
  // (purchase.tracking.{source_sck,external_code}). Reextraímos sobre o `item`
  // cru — o MESMO objeto que o sync persiste em raw_payload — pra pegar o
  // tracking do histórico de fato.
  const tracking = extractTracking(item);
  return {
    ...parsed,
    trafficSource: classifyTraffic(tracking),
    utmSource: tracking.utmSource,
    utmMedium: tracking.utmMedium,
    utmCampaign: tracking.utmCampaign,
    utmContent: tracking.utmContent,
    adExternalId: tracking.adExternalId,
    trackingRaw: tracking.trackingRaw,
  };
}
