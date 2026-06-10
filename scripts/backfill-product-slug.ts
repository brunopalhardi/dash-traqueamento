import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { campaigns, adAccounts } from "@/lib/schema/meta";
import { detectProduct } from "@/lib/products";
import { eq } from "drizzle-orm";

(async () => {
  const rows = await db
    .select({ id: campaigns.id, name: campaigns.name, acct: adAccounts.metaAccountId })
    .from(campaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId));

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const actId = r.acct.startsWith("act_") ? r.acct : `act_${r.acct}`;
    const slug = detectProduct(r.name, actId);
    await db.update(campaigns).set({ productSlug: slug }).where(eq(campaigns.id, r.id));
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  console.log("backfill ok:", counts);
  process.exit(0);
})();
