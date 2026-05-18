/**
 * Client da Sales History API do Hotmart.
 *
 * `fetchSalesHistory` é um async generator que pagina internamente até o
 * `next_page_token` vir null. Yield item a item pra não acumular tudo em
 * memória — o consumer decide quando parar.
 *
 * Doc: https://developers.hotmart.com/docs/en/v1/sales/sales-history/
 */
import { getAccessToken, invalidateAccessTokenCache } from "./oauth";

const BASE_URL = "https://developers.hotmart.com/payments/api/v1/sales/history";
const MAX_RESULTS = 100;

export interface FetchSalesHistoryOptions {
  startDate: Date;
  endDate: Date;
}

interface SalesHistoryPage {
  items: unknown[];
  page_info?: { next_page_token?: string | null };
}

async function fetchPage(
  url: string,
  token: string,
): Promise<{ ok: true; data: SalesHistoryPage } | { ok: false; status: number; body: string }> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    return { ok: false, status: 401, body: "" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  }
  return { ok: true, data: (await res.json()) as SalesHistoryPage };
}

function buildUrl(opts: FetchSalesHistoryOptions, pageToken: string | null): string {
  const params = new URLSearchParams({
    start_date: String(opts.startDate.getTime()),
    end_date: String(opts.endDate.getTime()),
    max_results: String(MAX_RESULTS),
  });
  if (pageToken) params.set("page_token", pageToken);
  return `${BASE_URL}?${params.toString()}`;
}

export async function* fetchSalesHistory(
  opts: FetchSalesHistoryOptions,
): AsyncIterable<unknown> {
  let pageToken: string | null = null;
  let retried401 = false;

  do {
    const url = buildUrl(opts, pageToken);
    let token = await getAccessToken();
    let result = await fetchPage(url, token);

    if (!result.ok && result.status === 401 && !retried401) {
      // Token pode ter expirado antes do TTL — força refresh uma vez
      invalidateAccessTokenCache();
      token = await getAccessToken();
      result = await fetchPage(url, token);
      retried401 = true;
    }

    if (!result.ok) {
      throw new Error(`hotmart sales-history: ${result.status} ${result.body}`);
    }

    for (const item of result.data.items ?? []) {
      yield item;
    }
    const nextToken = result.data.page_info?.next_page_token ?? null;
    // Guard contra loop infinito se o backend devolver o mesmo token (bug deles
    // ou nosso). Rodando em cron sem supervisão, não dá pra confiar cego.
    if (nextToken && nextToken === pageToken) {
      throw new Error("hotmart sales-history: page_token não avançou");
    }
    pageToken = nextToken;
  } while (pageToken);
}
