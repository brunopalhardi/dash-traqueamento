import { config } from "dotenv";
config({ path: ".env.local" });
import { syncSalesHistory } from "@/lib/hotmart/sync";

(async () => {
  console.log("Starting 365d backfill locally...");
  const t0 = Date.now();
  const result = await syncSalesHistory({ days: 365 });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
