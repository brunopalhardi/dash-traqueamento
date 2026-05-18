import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql, eq } from "drizzle-orm";

(async () => {
  const all = await db.select({
    name: purchases.productNameRaw,
    slug: purchases.productSlug,
    n: sql<number>`count(*)::int`,
  }).from(purchases).where(eq(purchases.status, "approved")).groupBy(purchases.productNameRaw, purchases.productSlug).orderBy(sql`count(*) desc`);
  console.log("=== Todos os produtos approved (incluindo outros) ===");
  console.log(JSON.stringify(all, null, 2));
  process.exit(0);
})();
