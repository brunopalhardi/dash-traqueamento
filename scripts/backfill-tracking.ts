import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { extractTracking, classifyTraffic } from "@/lib/hotmart/tracking";
import { eq } from "drizzle-orm";

(async () => {
  const rows = await db
    .select({ id: purchases.id, raw: purchases.rawPayload })
    .from(purchases);
  console.log(`Reprocessando ${rows.length} compras...`);
  const counts: Record<string, number> = {};
  let comUtm = 0;
  for (const r of rows) {
    const t = extractTracking(r.raw);
    const bucket = classifyTraffic(t);
    await db
      .update(purchases)
      .set({
        trafficSource: bucket,
        utmSource: t.utmSource,
        utmMedium: t.utmMedium,
        utmCampaign: t.utmCampaign,
        utmContent: t.utmContent,
        adExternalId: t.adExternalId,
        trackingRaw: t.trackingRaw,
        updatedAt: new Date(),
      })
      .where(eq(purchases.id, r.id));
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    if (t.utmCampaign) comUtm++;
  }
  console.log("backfill ok:", counts);
  console.log(`compras com utm_campaign preenchido: ${comUtm}`);
  process.exit(0);
})();
