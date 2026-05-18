import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql, gte, lte, eq, and, desc } from "drizzle-orm";

(async () => {
  const from = new Date("2026-05-04T00:00:00Z");
  const to = new Date("2026-05-16T23:59:59Z");
  const rows = await db.select({
    name: purchases.productNameRaw,
    slug: purchases.productSlug,
    status: purchases.status,
    buyerName: purchases.buyerName,
    purchasedAt: purchases.purchasedAt,
  }).from(purchases).where(and(
    gte(purchases.purchasedAt, from),
    lte(purchases.purchasedAt, to),
  )).orderBy(desc(purchases.purchasedAt));
  console.log(`=== Compras 04-16/05/2026 (${rows.length} total) ===`);
  for (const r of rows) {
    console.log(`${r.purchasedAt.toISOString().slice(0,10)} [${r.slug}/${r.status}] ${r.buyerName} — ${r.name}`);
  }
  process.exit(0);
})();
