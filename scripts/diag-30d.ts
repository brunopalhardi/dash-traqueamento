import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql, gte, eq, and } from "drizzle-orm";

(async () => {
  const from = new Date(Date.now() - 30 * 86_400_000);
  const counts = await db.select({
    slug: purchases.productSlug,
    status: purchases.status,
    n: sql<number>`count(*)::int`,
  }).from(purchases).where(gte(purchases.purchasedAt, from)).groupBy(purchases.productSlug, purchases.status).orderBy(sql`count(*) desc`);
  console.log(`=== Compras nos últimos 30 dias (desde ${from.toISOString().slice(0,10)}) ===`);
  console.log(JSON.stringify(counts, null, 2));
  const total = counts.reduce((s, r) => s + r.n, 0);
  const desafio = counts.filter(r => r.slug === "desafio").reduce((s, r) => s + r.n, 0);
  console.log(`\nTotal geral: ${total}`);
  console.log(`Total Desafio: ${desafio}`);
  process.exit(0);
})();
