import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { creatives, ads } from "@/lib/schema/meta";
import { sql, eq, isNotNull } from "drizzle-orm";

(async () => {
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(creatives);
  const withThumb = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(creatives)
    .where(isNotNull(creatives.thumbnailUrl));
  console.log(`creatives total: ${total[0].n}`);
  console.log(`creatives com thumbnailUrl: ${withThumb[0].n}`);

  const sample = await db
    .select({
      adName: ads.name,
      thumb: creatives.thumbnailUrl,
      videoId: creatives.videoId,
      effectiveStatus: ads.effectiveStatus,
    })
    .from(ads)
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .where(sql`${ads.name} like '%VD-DESAFIO%'`)
    .limit(8);
  console.log("\n=== Sample ads VD-DESAFIO ===");
  for (const s of sample) {
    console.log(`${s.adName} | thumb=${s.thumb?.slice(0, 80) ?? "NULL"} | video=${s.videoId ?? "NULL"}`);
  }
  process.exit(0);
})();
