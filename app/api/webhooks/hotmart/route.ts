/**
 * Webhook do Hotmart — recebe eventos de compra aprovada/reembolso/chargeback.
 *
 * Configuração no painel Hotmart:
 *   URL: https://dash-traqueamento.vercel.app/api/webhooks/hotmart
 *   Eventos processados: PURCHASE_APPROVED, PURCHASE_REFUNDED, PURCHASE_CHARGEBACK
 *   (Outros eventos chegam e são ignorados com 200 — Bruno marca todos
 *    no painel pra ter histórico futuro caso a gente expanda o handler.)
 *   Hottok: valor de HOTTOK na Vercel
 *
 * Auth: header X-Hotmart-Hottok deve bater com env HOTTOK.
 * Idempotência: ON CONFLICT (transaction_id) DO UPDATE.
 *
 * GET na mesma URL retorna 200 com status — útil pro Hotmart validar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { parsePurchasePayload } from "@/lib/hotmart/parser";

export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
]);

function tokenFromRequest(req: NextRequest): string | null {
  return (
    req.headers.get("x-hotmart-hottok") ??
    req.nextUrl.searchParams.get("hottok") ??
    null
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "hotmart-webhook",
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.HOTTOK;
  if (!expected) {
    return NextResponse.json(
      { error: "HOTTOK não configurado no servidor" },
      { status: 503 },
    );
  }
  if (tokenFromRequest(req) !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Hotmart envia 15+ tipos de evento; só processamos 3. Pra outros, ack 200
  // sem persistir — evita Hotmart desabilitar o webhook por taxa de erro alta.
  const evt =
    typeof raw === "object" && raw !== null
      ? ((raw as Record<string, unknown>).event as string | undefined)
      : undefined;
  if (evt && !HANDLED_EVENTS.has(evt)) {
    return NextResponse.json({ ok: true, ignored: true, event: evt });
  }

  const parsed = parsePurchasePayload(raw);
  if (!parsed) {
    console.warn(
      "[hotmart] payload inválido — sem transaction_id ou event desconhecido",
      raw,
    );
    return NextResponse.json(
      { error: "payload inválido: faltam transaction_id e/ou event" },
      { status: 400 },
    );
  }

  const now = new Date();

  await db
    .insert(purchases)
    .values({
      transactionId: parsed.transactionId,
      productSlug: parsed.productSlug,
      productNameRaw: parsed.productNameRaw,
      status: parsed.status,
      buyerName: parsed.buyerName,
      buyerEmail: parsed.buyerEmail,
      buyerPhoneRaw: parsed.buyerPhoneRaw,
      buyerPhoneE164: parsed.buyerPhoneE164,
      valueCents: parsed.valueCents,
      currency: parsed.currency,
      purchasedAt: parsed.purchasedAt,
      rawPayload: raw as object,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: purchases.transactionId,
      set: {
        status: parsed.status,
        // Não sobrescreve dados do comprador com null em retries com payload reduzido
        buyerName: sql`coalesce(excluded.buyer_name, ${purchases.buyerName})`,
        buyerEmail: sql`coalesce(excluded.buyer_email, ${purchases.buyerEmail})`,
        buyerPhoneRaw: sql`coalesce(excluded.buyer_phone_raw, ${purchases.buyerPhoneRaw})`,
        buyerPhoneE164: sql`coalesce(excluded.buyer_phone_e164, ${purchases.buyerPhoneE164})`,
        // raw_payload é sobrescrito de propósito: o último evento (refund/chargeback)
        // costuma ser mais relevante pra debug que o approved original.
        rawPayload: raw as object,
        updatedAt: now,
      },
    });

  return NextResponse.json({
    ok: true,
    transactionId: parsed.transactionId,
    status: parsed.status,
  });
}
