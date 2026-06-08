/** URL canônica de uma página: scheme+host(lower)+path, sem query/UTM, sem barra final (exceto raiz). */
export function normalizePageUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (path === "") path = "/";
    return `${u.protocol}//${host}${path}`;
  } catch {
    return null;
  }
}

const PLAYER_ID = "[a-f0-9]{24}";
const RE_SCRIPT = new RegExp(`converteai\\.net\\/[^"'\\s]*?\\/players\\/(${PLAYER_ID})`, "gi");
const RE_ELEMENT = new RegExp(`vid[-_](${PLAYER_ID})`, "gi");
const RE_PLAYERS_PATH = new RegExp(`players\\/(${PLAYER_ID})`, "gi");

/** Extrai player_id(s) do HTML cru de uma página com embed VTurb/ConverteAI. */
export function extractPlayerIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(RE_SCRIPT)) ids.add(m[1].toLowerCase());
  for (const m of html.matchAll(RE_ELEMENT)) ids.add(m[1].toLowerCase());
  for (const m of html.matchAll(RE_PLAYERS_PATH)) ids.add(m[1].toLowerCase());
  return [...ids];
}

export interface ScrapeResult {
  status: "ok" | "no_embed" | "http_error";
  httpStatus: number | null;
  players: string[];
}

const UA = "Mozilla/5.0 (compatible; TraqueamentoBot/1.0)";

export async function fetchPlayerIds(url: string, fetchImpl: typeof fetch = fetch): Promise<ScrapeResult> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetchImpl(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status < 200 || res.status >= 400) {
      return { status: "http_error", httpStatus: res.status, players: [] };
    }
    const html = await res.text();
    const players = extractPlayerIds(html);
    return { status: players.length ? "ok" : "no_embed", httpStatus: res.status, players };
  } catch {
    return { status: "http_error", httpStatus: null, players: [] };
  }
}
