import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { ads, creatives } from "@/lib/schema/meta";
import { sql, eq } from "drizzle-orm";

(async () => {
  // Check how many ads VD-DESAFIO have creativeId
  const all = await db.select({
    name: ads.name,
    creativeId: ads.creativeId,
  }).from(ads).where(sql`${ads.name} like '%VD-DESAFIO%'`).limit(10);
  console.log("=== Sample VD-DESAFIO ads ===");
  for (const a of all) console.log(`${a.name} | creativeId=${a.creativeId ?? "NULL"}`);

  // Check ads with creativeId NOT NULL but thumb null
  const joined = await db
    .select({
      name: ads.name,
      cid: ads.creativeId,
      thumb: creatives.thumbnailUrl,
    })
    .from(ads)
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .where(sql`${ads.name} like '%VD-DESAFIO%'`)
    .limit(10);
  console.log("\n=== JOIN VD-DESAFIO ===");
  for (const r of joined) console.log(`${r.name} | cid=${r.cid} | thumb=${r.thumb?.slice(0, 80) ?? "NULL"}`);

  process.exit(0);
})();
