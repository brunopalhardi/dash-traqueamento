import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql, eq, and, desc } from "drizzle-orm";

(async () => {
  // Counts of phones in purchases for desafio
  const counts = await db.select({
    withPhone: sql<number>`count(*) filter (where ${purchases.buyerPhoneE164} is not null)::int`,
    withoutPhone: sql<number>`count(*) filter (where ${purchases.buyerPhoneE164} is null)::int`,
    withRawPhone: sql<number>`count(*) filter (where ${purchases.buyerPhoneRaw} is not null)::int`,
  }).from(purchases).where(eq(purchases.productSlug, "desafio"));
  console.log("=== Telefones em purchases desafio ===");
  console.log(counts[0]);

  // Compare 1 with phone vs 1 without
  const withP = await db.select({
    tx: purchases.transactionId,
    name: purchases.buyerName,
    rawPhone: purchases.buyerPhoneRaw,
    raw: purchases.rawPayload,
  }).from(purchases).where(and(
    eq(purchases.productSlug, "desafio"),
    sql`${purchases.buyerPhoneE164} is not null`,
  )).limit(1);

  const withoutP = await db.select({
    tx: purchases.transactionId,
    name: purchases.buyerName,
    raw: purchases.rawPayload,
  }).from(purchases).where(and(
    eq(purchases.productSlug, "desafio"),
    sql`${purchases.buyerPhoneE164} is null`,
  )).limit(1);

  console.log("\n=== Com telefone (raw_payload buyer) ===");
  if (withP[0]) {
    console.log(`${withP[0].name} | rawPhone=${withP[0].rawPhone}`);
    const buyer = (withP[0].raw as any)?.data?.buyer ?? (withP[0].raw as any)?.buyer ?? null;
    console.log("buyer keys:", buyer ? Object.keys(buyer) : "(no buyer)");
    console.log("buyer fields:", buyer ? JSON.stringify(buyer, null, 2).slice(0, 500) : "");
  }
  console.log("\n=== Sem telefone (raw_payload buyer) ===");
  if (withoutP[0]) {
    console.log(`${withoutP[0].name}`);
    const buyer = (withoutP[0].raw as any)?.data?.buyer ?? (withoutP[0].raw as any)?.buyer ?? null;
    console.log("buyer keys:", buyer ? Object.keys(buyer) : "(no buyer)");
    console.log("buyer fields:", buyer ? JSON.stringify(buyer, null, 2).slice(0, 500) : "");
  }
  process.exit(0);
})();
