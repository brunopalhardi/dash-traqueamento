/**
 * Investigação empírica: quais endpoints Hotmart retornam telefone do comprador
 * pra uma transação específica?
 *
 * Pega 1 transactionId real do DB (compra Desafio sem buyer_phone_e164),
 * testa vários endpoints candidatos da Hotmart Payments API v1, loga o que
 * cada um retorna (full body), e a gente decide com base em evidência real.
 *
 * Run: npx tsx --env-file=.env.local scripts/diag-hotmart-phone-endpoints.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { and, eq, isNull } from "drizzle-orm";
import { getAccessToken } from "@/lib/hotmart/oauth";

const BASE = "https://developers.hotmart.com/payments/api/v1";

async function tryEndpoint(label: string, path: string, params: Record<string, string>) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${url.toString()}`);
  const token = await getAccessToken();
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Status: ${res.status}`);
  const text = await res.text();
  // Tenta JSON-pretty se for JSON
  try {
    const json = JSON.parse(text);
    console.log("Body:", JSON.stringify(json, null, 2).slice(0, 4000));
  } catch {
    console.log("Body (raw):", text.slice(0, 1000));
  }
}

(async () => {
  // Pega 1 transação Desafio approved sem telefone
  const [target] = await db
    .select({
      transactionId: purchases.transactionId,
      buyerEmail: purchases.buyerEmail,
      buyerName: purchases.buyerName,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, "desafio"),
        eq(purchases.status, "approved"),
        isNull(purchases.buyerPhoneE164),
      ),
    )
    .limit(1);

  if (!target) {
    console.log("Nenhuma purchase Desafio sem telefone — investigação não aplicável");
    process.exit(0);
  }

  console.log(`Target: transactionId=${target.transactionId}, buyer=${target.buyerName} <${target.buyerEmail}>`);

  // Testa endpoints candidatos. Cada um com filtros diferentes pra explorar a API.
  await tryEndpoint(
    "1. sales/history com transaction filter",
    "/sales/history",
    { transaction: target.transactionId, max_results: "5" },
  );

  await tryEndpoint(
    "2. sales/users (sales.participants do SDK)",
    "/sales/users",
    { transaction: target.transactionId, max_results: "5" },
  );

  // Algumas APIs usam transaction_status + buyer_email pra encontrar
  if (target.buyerEmail) {
    await tryEndpoint(
      "3. sales/users por buyer_email",
      "/sales/users",
      { buyer_email: target.buyerEmail, max_results: "5" },
    );
  }

  await tryEndpoint(
    "4. sales/commissions com transaction",
    "/sales/commissions",
    { transaction: target.transactionId, max_results: "5" },
  );

  await tryEndpoint(
    "5. sales/price_details com transaction",
    "/sales/price_details",
    { transaction: target.transactionId, max_results: "5" },
  );

  await tryEndpoint(
    "6. (chute) sales/transactions/{id} — meu palpite original",
    `/sales/transactions/${target.transactionId}`,
    {},
  );

  await tryEndpoint(
    "7. (chute) sales/{id} — variante minimal",
    `/sales/${target.transactionId}`,
    {},
  );

  console.log("\n=== Resumo ===");
  console.log("Procure por: 'phone', 'telefone', 'checkout_phone' nos bodies acima.");
  console.log("Qualquer endpoint com status 200 + phone na resposta é viável pro backfill.");

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
