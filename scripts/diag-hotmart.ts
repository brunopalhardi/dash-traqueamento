import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { syncJobs } from "@/lib/schema/sync";
import { sql, desc, eq } from "drizzle-orm";

(async () => {
  const jobs = await db.select({
    id: syncJobs.id, status: syncJobs.status,
    startedAt: syncJobs.startedAt, finishedAt: syncJobs.finishedAt,
    rowsProcessed: syncJobs.rowsProcessed, errorMessage: syncJobs.errorMessage,
    details: syncJobs.details,
  }).from(syncJobs).where(eq(syncJobs.type, "hotmart_replay")).orderBy(desc(syncJobs.id)).limit(5);
  console.log("=== últimos 5 hotmart_replay jobs ===");
  console.log(JSON.stringify(jobs, null, 2));

  const counts = await db.select({
    productSlug: purchases.productSlug,
    status: purchases.status,
    n: sql`count(*)::int`,
  }).from(purchases).groupBy(purchases.productSlug, purchases.status);
  console.log("\n=== contagem purchases por (productSlug, status) ===");
  console.log(JSON.stringify(counts, null, 2));

  const sample = await db.select({
    transactionId: purchases.transactionId,
    productSlug: purchases.productSlug,
    productNameRaw: purchases.productNameRaw,
    status: purchases.status,
    buyerName: purchases.buyerName,
    purchasedAt: purchases.purchasedAt,
  }).from(purchases).orderBy(desc(purchases.purchasedAt)).limit(15);
  console.log("\n=== últimas 15 purchases ===");
  console.log(JSON.stringify(sample, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
