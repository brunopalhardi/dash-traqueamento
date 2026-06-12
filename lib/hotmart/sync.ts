/**
 * Orquestrador do sync de sales-history.
 *
 * - Cria row em sync_jobs (type=hotmart_replay), marca running.
 * - Calcula janela: now-days*24h-2h overlap → now.
 * - Itera fetchSalesHistory, parseSalesHistoryItem, UPSERT em purchases
 *   (mesma idempotência do webhook via ON CONFLICT transaction_id).
 * - No final, atualiza sync_jobs com stats e marca done/failed.
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { syncJobs } from "@/lib/schema/sync";
import { fetchSalesHistory, fetchBuyerPhone } from "./client";
import { parseSalesHistoryItem } from "./parser-history";
import { normalizePhone } from "@/lib/utils/phone";

const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2h

export interface SyncStats {
  jobId: number;
  startDate: string;
  endDate: string;
  processed: number;
  upserted: number;
  skipped: number;
  durationMs: number;
}

async function upsertPurchase(item: unknown, now: Date): Promise<boolean> {
  const parsed = parseSalesHistoryItem(item);
  if (!parsed) return false;

  // Sales-history NÃO traz telefone — só /sales/users traz. Enriquece compras
  // approved sem telefone com 1 call extra. Restrito a approved porque é o que
  // entra no match comprador↔grupo; refunded/chargeback não precisam.
  // Falha aqui não pode derrubar o sync inteiro → try/catch e segue sem phone.
  let buyerPhoneRaw = parsed.buyerPhoneRaw;
  let buyerPhoneE164 = parsed.buyerPhoneE164;
  if (parsed.status === "approved" && !buyerPhoneE164) {
    // O cron reprocessa a janela de overlap; como o sales-history nunca traz
    // telefone, sem este guard toda compra approved re-bateria no /sales/users
    // a cada sync. Só busca se o registro ainda não tem telefone no banco.
    const [existing] = await db
      .select({ phone: purchases.buyerPhoneE164 })
      .from(purchases)
      .where(eq(purchases.transactionId, parsed.transactionId))
      .limit(1);
    if (!existing?.phone) {
      try {
        const fromUsers = await fetchBuyerPhone(parsed.transactionId);
        if (fromUsers?.phone) {
          const e164 = normalizePhone(fromUsers.phone);
          if (e164) {
            buyerPhoneRaw = fromUsers.phone;
            buyerPhoneE164 = e164;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[hotmart-sync] fetchBuyerPhone falhou (${parsed.transactionId}): ${msg}`);
      }
    }
  }

  await db
    .insert(purchases)
    .values({
      transactionId: parsed.transactionId,
      productSlug: parsed.productSlug,
      productNameRaw: parsed.productNameRaw,
      status: parsed.status,
      buyerName: parsed.buyerName,
      buyerEmail: parsed.buyerEmail,
      buyerPhoneRaw,
      buyerPhoneE164,
      valueCents: parsed.valueCents,
      currency: parsed.currency,
      purchasedAt: parsed.purchasedAt,
      trafficSource: parsed.trafficSource,
      utmSource: parsed.utmSource,
      utmMedium: parsed.utmMedium,
      utmCampaign: parsed.utmCampaign,
      utmContent: parsed.utmContent,
      adExternalId: parsed.adExternalId,
      trackingRaw: parsed.trackingRaw,
      rawPayload: item as object,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: purchases.transactionId,
      set: {
        status: parsed.status,
        buyerName: sql`coalesce(excluded.buyer_name, ${purchases.buyerName})`,
        buyerEmail: sql`coalesce(excluded.buyer_email, ${purchases.buyerEmail})`,
        buyerPhoneRaw: sql`coalesce(excluded.buyer_phone_raw, ${purchases.buyerPhoneRaw})`,
        buyerPhoneE164: sql`coalesce(excluded.buyer_phone_e164, ${purchases.buyerPhoneE164})`,
        // Atribuição: reprocessar atualiza pra refletir reclassificação do tracking.
        trafficSource: parsed.trafficSource,
        utmSource: parsed.utmSource,
        utmMedium: parsed.utmMedium,
        utmCampaign: parsed.utmCampaign,
        utmContent: parsed.utmContent,
        adExternalId: parsed.adExternalId,
        trackingRaw: parsed.trackingRaw,
        rawPayload: item as object,
        updatedAt: now,
      },
    });
  return true;
}

export async function syncSalesHistory({ days }: { days: number }): Promise<SyncStats> {
  const t0 = Date.now();
  const now = new Date();
  const endDate = now;
  const startDate = new Date(now.getTime() - days * 86_400_000 - OVERLAP_MS);

  const [job] = await db
    .insert(syncJobs)
    .values({
      type: "hotmart_replay",
      status: "running",
      startedAt: now,
      details: { days, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    })
    .returning({ id: syncJobs.id });

  let processed = 0;
  let upserted = 0;
  let skipped = 0;

  try {
    for await (const item of fetchSalesHistory({ startDate, endDate })) {
      processed++;
      const ok = await upsertPurchase(item, now);
      if (ok) upserted++;
      else skipped++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Wrap em try/catch pra não mascarar `err` se o próprio update falhar
    // (DB indisponível, etc). Aceita ficar com row 'running' em troca de
    // propagar a causa raiz.
    try {
      await db
        .update(syncJobs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          rowsProcessed: processed,
          errorMessage: message,
          details: {
            days,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            processed,
            upserted,
            skipped,
          },
        })
        .where(eq(syncJobs.id, job.id));
    } catch (updateErr) {
      console.error("[hotmart-sync] failed to persist failure state:", updateErr);
    }
    throw err;
  }

  const durationMs = Date.now() - t0;
  await db
    .update(syncJobs)
    .set({
      status: "done",
      finishedAt: new Date(),
      rowsProcessed: upserted,
      details: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        processed,
        upserted,
        skipped,
        durationMs,
      },
    })
    .where(eq(syncJobs.id, job.id));

  return {
    jobId: job.id,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    processed,
    upserted,
    skipped,
    durationMs,
  };
}
