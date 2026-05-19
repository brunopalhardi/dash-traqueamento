import { MetaApiError, MetaAuthError, MetaRateLimitError } from "./errors";
import type {
  DatePreset,
  MetaAd,
  MetaAdAccount,
  MetaAdSet,
  MetaCampaign,
  MetaCreative,
  MetaInsight,
  MetaListResponse,
  MetaUser,
} from "./types";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80000, 80001, 80002, 80003, 80004, 80014]);
const AUTH_ERROR_CODES = new Set([102, 190, 200, 459, 463, 464, 467]);
// Sem timeout, um Graph travado segura a função inteira até a Vercel matar
// em 300s — sem dar chance pro retry agir. 30s é folgado pra paginas grandes
// e ainda permite 4 retries dentro do budget.
const FETCH_TIMEOUT_MS = 30_000;

export interface MetaClient {
  getMe(): Promise<MetaUser>;
  getAdAccounts(): Promise<MetaAdAccount[]>;
  getCampaigns(accountId: string): Promise<MetaCampaign[]>;
  getAdSets(accountId: string): Promise<MetaAdSet[]>;
  getAds(accountId: string): Promise<MetaAd[]>;
  getCreatives(accountId: string): Promise<MetaCreative[]>;
  getInsights(
    accountId: string,
    opts: { datePreset: DatePreset },
  ): Promise<MetaInsight[]>;
}

export interface MetaClientConfig {
  token: string;
  graphVersion?: string;
  sleep?: (ms: number) => Promise<void>;
}

export function createMetaClient(cfg: MetaClientConfig): MetaClient {
  const version = cfg.graphVersion ?? "v21.0";
  const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = `https://graph.facebook.com/${version}`;

  async function requestUrl<T>(absoluteUrl: string): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      let res: Response;
      try {
        res = await fetch(absoluteUrl, {
          headers: { Authorization: `Bearer ${cfg.token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        // Timeout (AbortError) ou erro de rede — trata como retriable
        lastErr = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new MetaApiError(`network/timeout: ${msg}`);
      }
      const usage = res.headers.get("x-business-use-case-usage");
      if (usage) {
        try {
          const parsed = JSON.parse(usage) as Record<string, Array<{ call_count?: number }>>;
          for (const arr of Object.values(parsed)) {
            for (const u of arr) {
              if ((u.call_count ?? 0) > 75) {
                console.warn(JSON.stringify({ msg: "meta_usage_high", usage: parsed }));
              }
            }
          }
        } catch {
          /* ignore parse errors */
        }
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }

      if (res.ok) return body as T;

      const errPayload = (body as { error?: { code?: number; message?: string } } | undefined)?.error;
      const code = errPayload?.code;
      const message = errPayload?.message ?? `HTTP ${res.status}`;

      if (code && AUTH_ERROR_CODES.has(code)) {
        throw new MetaAuthError(message, code, body);
      }

      const retriable =
        res.status === 429 ||
        res.status >= 500 ||
        (code !== undefined && RATE_LIMIT_CODES.has(code));

      if (retriable && attempt < RETRY_DELAYS_MS.length) {
        lastErr = new MetaRateLimitError(message, body);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (retriable) {
        throw new MetaRateLimitError(message, body);
      }
      throw new MetaApiError(message, code, undefined, res.status, body);
    }
    throw (lastErr ?? new MetaApiError("unknown error"));
  }

  async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return requestUrl<T>(url.toString());
  }

  async function paginate<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    const firstUrl = new URL(base + path);
    for (const [k, v] of Object.entries(params)) firstUrl.searchParams.set(k, v);
    let nextUrl: string | undefined = firstUrl.toString();
    while (nextUrl) {
      const page: MetaListResponse<T> = await requestUrl<MetaListResponse<T>>(nextUrl);
      out.push(...page.data);
      nextUrl = page.paging?.next;
    }
    return out;
  }

  // Para campaigns/adsets/ads, o Meta exige o parâmetro nomeado
  // `effective_status=["ACTIVE"]` — `filtering=[{field:effective_status...}]`
  // é silenciosamente ignorado nesses endpoints e devolve tudo. Já no
  // endpoint de insights o `filtering` com `ad.effective_status` funciona.
  const STATUS_PARAM = JSON.stringify(["ACTIVE"]);
  const INSIGHTS_FILTER = JSON.stringify([
    { field: "ad.effective_status", operator: "IN", value: ["ACTIVE"] },
  ]);

  return {
    getMe: () => request<MetaUser>("/me", { fields: "id,name" }),
    getAdAccounts: () =>
      paginate<MetaAdAccount>("/me/adaccounts", {
        fields: "id,account_id,name,currency,timezone_name,account_status",
        limit: "100",
      }),
    getCampaigns: (accountId) =>
      paginate<MetaCampaign>(`/${accountId}/campaigns`, {
        fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
        effective_status: STATUS_PARAM,
        limit: "200",
      }),
    getAdSets: (accountId) =>
      paginate<MetaAdSet>(`/${accountId}/adsets`, {
        fields: "id,campaign_id,name,status,daily_budget,optimization_goal,targeting",
        effective_status: STATUS_PARAM,
        limit: "200",
      }),
    getAds: (accountId) =>
      paginate<MetaAd>(`/${accountId}/ads`, {
        fields: "id,adset_id,name,status,creative{id},preview_shareable_link",
        effective_status: STATUS_PARAM,
        limit: "200",
      }),
    getCreatives: (accountId) =>
      paginate<MetaCreative>(`/${accountId}/adcreatives`, {
        // image_url devolve a original (alta res). thumbnail_url{w,h}=400 é
        // fallback pra criativos sem image_url — sem isso o Meta entrega 64x64.
        fields:
          "id,name,thumbnail_url,image_url,video_id,object_type,title,body,call_to_action_type",
        thumbnail_width: "400",
        thumbnail_height: "400",
        limit: "200",
      }),
    getInsights: (accountId, opts) =>
      paginate<MetaInsight>(`/${accountId}/insights`, {
        level: "ad",
        time_increment: "1",
        date_preset: opts.datePreset,
        fields:
          "ad_id,date_start,date_stop,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,inline_link_clicks,actions,action_values,video_play_actions",
        filtering: INSIGHTS_FILTER,
        limit: "500",
      }),
  };
}
