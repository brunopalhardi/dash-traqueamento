import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql, gte, lte, eq, and } from "drizzle-orm";

(async () => {
  const from = new Date("2026-05-04T00:00:00Z");
  const to = new Date("2026-05-16T23:59:59Z");
  const rows = await db.select({
    slug: purchases.productSlug,
    n: sql<number>`count(*)::int`,
  }).from(purchases).where(and(
    eq(purchases.status, "approved"),
    gte(purchases.purchasedAt, from),
    lte(purchases.purchasedAt, to),
  )).groupBy(purchases.productSlug);
  console.log("=== 04-16/05/2026 (13 dias) — approved ===");
  console.log(JSON.stringify(rows, null, 2));
  const total = rows.reduce((s, r) => s + r.n, 0);
  console.log(`\nTotal: ${total}`);
  process.exit(0);
})();
