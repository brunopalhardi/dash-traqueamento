/**
 * Investigação empírica do SendFlow REST API.
 * Lista releases + grupos da primeira release + analytics + leadscoring.
 *
 * Run: npx tsx --env-file=.env.local scripts/diag-sendflow.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://sendflow.pro/sendapi";

async function tryEndpoint(label: string, path: string) {
  const token = process.env.SENDFLOW_TOKEN;
  if (!token) throw new Error("SENDFLOW_TOKEN não configurado");
  const url = `${BASE}${path}`;
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Status: ${res.status}`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    console.log("Body:", JSON.stringify(json, null, 2).slice(0, 4000));
    return json;
  } catch {
    console.log("Body (raw):", text.slice(0, 1000));
    return null;
  }
}

(async () => {
  // 1. Lista releases
  const releases = (await tryEndpoint("1. /releases", "/releases")) as {
    data?: Array<{ id?: string; name?: string }>;
  } | Array<{ id?: string; name?: string }> | null;

  // Tenta achar o primeiro release ID — payload pode ser {data: []} ou [] direto
  const first = Array.isArray(releases)
    ? releases[0]
    : releases?.data?.[0];
  const releaseId = first?.id;

  if (!releaseId) {
    console.log("\n!! Sem releases ou shape inesperado. Para aqui.");
    process.exit(0);
  }

  console.log(`\n>>> Primeiro release encontrado: ${releaseId} (${first?.name ?? "sem nome"})`);

  // 2. Grupos dessa release
  await tryEndpoint(`2. /releases/${releaseId}/groups`, `/releases/${releaseId}/groups`);

  // 3. Analytics dessa release
  await tryEndpoint(`3. /releases/${releaseId}/analytics`, `/releases/${releaseId}/analytics`);

  // 4. Lead scoring
  await tryEndpoint(`4. /releases/${releaseId}/leadscoring`, `/releases/${releaseId}/leadscoring`);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
