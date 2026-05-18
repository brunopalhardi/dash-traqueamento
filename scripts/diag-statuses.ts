import { config } from "dotenv";
config({ path: ".env.local" });
import { fetchSalesHistory } from "@/lib/hotmart/client";

(async () => {
  const endDate = new Date();
  const startDate = new Date(Date.now() - 365 * 86_400_000);
  const counts = new Map<string, number>();
  const sampleByStatus = new Map<string, unknown>();
  let total = 0;
  for await (const item of fetchSalesHistory({ startDate, endDate })) {
    total++;
    const status = (item as { purchase?: { status?: string } })?.purchase?.status ?? "UNKNOWN";
    counts.set(status, (counts.get(status) ?? 0) + 1);
    if (!sampleByStatus.has(status)) sampleByStatus.set(status, item);
  }
  console.log(`=== Status únicos em ${total} items (últimos 365d) ===`);
  const sorted = [...counts.entries()].sort((a,b) => b[1] - a[1]);
  for (const [s, n] of sorted) console.log(`  ${s.padEnd(20)} ${n}`);
  console.log(`\n=== Exemplos por status (1 cada) ===`);
  for (const [s] of sorted) {
    const item = sampleByStatus.get(s) as { product?: { name?: string }, buyer?: { name?: string } } | undefined;
    console.log(`  ${s.padEnd(20)} ${item?.product?.name ?? "?"} | ${item?.buyer?.name ?? "?"}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
