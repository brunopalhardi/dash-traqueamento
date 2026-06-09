import { config } from "dotenv";
config({ path: ".env.local" });
import { createVturbClient } from "@/lib/vturb/client";
import { syncVturb } from "@/lib/sync/syncVturb";

(async () => {
  const client = createVturbClient({ token: process.env.VTURB_API_TOKEN! });
  const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 29);
  const r = await syncVturb({ client, range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})();
