import { config } from "dotenv";
config({ path: ".env.local" });
import { createMetaClient } from "@/lib/meta/client";
import { syncMeta } from "@/lib/sync/syncMeta";

(async () => {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN not in .env.local");
  console.log("Starting Meta backfill (full creatives + ads + insights)...");
  const t0 = Date.now();
  const client = createMetaClient({ token, graphVersion: process.env.META_GRAPH_VERSION });
  const result = await syncMeta({ mode: "backfill", client });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
