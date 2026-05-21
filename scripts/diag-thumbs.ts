import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { creatives, ads } from "@/lib/schema/meta";
import { sql, eq } from "drizzle-orm";

(async () => {
  // 1. Totais por tipo
  const counts = await db
    .select({
      type: creatives.type,
      total: sql<number>`count(*)::int`,
      with_thumb: sql<number>`sum(case when ${creatives.thumbnailUrl} is not null then 1 else 0 end)::int`,
      avg_url_len: sql<number>`avg(length(${creatives.thumbnailUrl}))::int`,
    })
    .from(creatives)
    .groupBy(creatives.type);

  console.log("=== Creatives por tipo (total + com thumb + tamanho médio URL) ===");
  for (const r of counts) {
    console.log(`  ${r.type ?? "(null)"}: total=${r.total}, with_thumb=${r.with_thumb}, avg_url_len=${r.avg_url_len}`);
  }

  // 2. Sample VD-DESAFIO com URL completa
  const sample = await db
    .select({
      adName: ads.name,
      crName: creatives.name,
      crType: creatives.type,
      thumb: creatives.thumbnailUrl,
    })
    .from(ads)
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .where(sql`${ads.name} like '%-VD-DESAFIO%'`)
    .limit(8);

  console.log("\n=== Sample 8 ads VD-DESAFIO ===");
  for (const s of sample) {
    console.log(`\n  ad:    ${s.adName}`);
    console.log(`  cr:    ${s.crName ?? "—"} (${s.crType ?? "—"})`);
    console.log(`  thumb: ${s.thumb ?? "NULL"}`);
  }

  // 3. Padrão de URL: quais hosts vêm
  const hosts = await db
    .select({
      host: sql<string>`substring(${creatives.thumbnailUrl} from '://([^/]+)')`,
      type: creatives.type,
      n: sql<number>`count(*)::int`,
    })
    .from(creatives)
    .where(sql`${creatives.thumbnailUrl} is not null`)
    .groupBy(sql`substring(${creatives.thumbnailUrl} from '://([^/]+)')`, creatives.type)
    .orderBy(sql`count(*) desc`);

  console.log("\n=== Hosts das URLs por tipo ===");
  for (const h of hosts) {
    console.log(`  ${h.type}: ${h.host} (${h.n})`);
  }

  process.exit(0);
})();
