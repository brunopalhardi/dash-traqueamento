/**
 * Backfill de buyerPhoneE164 nas purchases — pra compras antigas onde o
 * sales-history NÃO trouxe telefone (sales-history só tem name/email/ucode).
 * Consulta `GET /sales/users?transaction=<id>` que devolve cellphone.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/backfill-hotmart-phones.ts --dry
 *   npx tsx --env-file=.env.local scripts/backfill-hotmart-phones.ts
 *
 * --dry: só mostra o que seria feito, NÃO escreve no DB.
 *
 * Idempotente: skip purchases que já têm buyerPhoneE164.
 * Rate-limited: 5 req/s (200ms entre calls) — conservador.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { and, isNull, eq } from "drizzle-orm";
import { fetchBuyerPhone } from "@/lib/hotmart/client";
import { normalizePhone } from "@/lib/utils/phone";

const RATE_LIMIT_MS = 200;
const DRY = process.argv.includes("--dry");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log(`Mode: ${DRY ? "DRY-RUN (sem escrita)" : "REAL (vai escrever no DB)"}`);

  // Pega só approved sem telefone — não vale a pena gastar request com refunded
  const targets = await db
    .select({
      transactionId: purchases.transactionId,
      buyerName: purchases.buyerName,
      buyerEmail: purchases.buyerEmail,
      productSlug: purchases.productSlug,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.status, "approved"),
        isNull(purchases.buyerPhoneE164),
      ),
    );

  console.log(`Total alvo: ${targets.length} purchases approved sem phone`);
  if (targets.length === 0) {
    console.log("Nada a fazer.");
    process.exit(0);
  }

  let found = 0;
  let notFound = 0;
  let failed = 0;
  let updated = 0;

  const t0 = Date.now();
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const result = await fetchBuyerPhone(t.transactionId);
      if (!result || !result.phone) {
        notFound++;
        console.log(`  [${i + 1}/${targets.length}] ${t.transactionId} (${t.buyerName}): SEM phone na API`);
      } else {
        const e164 = normalizePhone(result.phone);
        if (!e164) {
          notFound++;
          console.log(`  [${i + 1}/${targets.length}] ${t.transactionId} (${t.buyerName}): phone "${result.phone}" inválido`);
        } else {
          found++;
          console.log(`  [${i + 1}/${targets.length}] ${t.transactionId} (${t.buyerName}): "${result.phone}" → ${e164}`);
          if (!DRY) {
            await db
              .update(purchases)
              .set({ buyerPhoneRaw: result.phone, buyerPhoneE164: e164 })
              .where(eq(purchases.transactionId, t.transactionId));
            updated++;
          }
        }
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${i + 1}/${targets.length}] ${t.transactionId}: FAIL ${msg}`);
    }

    if (i < targets.length - 1) await sleep(RATE_LIMIT_MS);
  }

  const dt = Math.round((Date.now() - t0) / 1000);
  console.log(`\n=== Resumo (${dt}s) ===`);
  console.log(`  encontrado phone : ${found}`);
  console.log(`  sem phone na API : ${notFound}`);
  console.log(`  request falhou   : ${failed}`);
  console.log(`  DB updated       : ${updated} ${DRY ? "(dry-run, nada escrito)" : ""}`);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
