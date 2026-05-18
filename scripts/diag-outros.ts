import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql, desc, eq, and } from "drizzle-orm";

(async () => {
  const rows = await db.select({
    name: purchases.productNameRaw,
    n: sql<number>`count(*)::int`,
  }).from(purchases).where(and(eq(purchases.productSlug, "outros"), eq(purchases.status, "approved"))).groupBy(purchases.productNameRaw).orderBy(sql`count(*) desc`);
  console.log("=== produtos classificados como 'outros' (approved) ===");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
})();
