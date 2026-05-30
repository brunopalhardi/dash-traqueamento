/**
 * Client da Sales API do Hotmart.
 *
 * `fetchSalesHistory` é um async generator que pagina internamente até o
 * `next_page_token` vir null. Yield item a item pra não acumular tudo em
 * memória — o consumer decide quando parar.
 *
 * `fetchBuyerPhone(transactionId)` consulta `/sales/users` — único endpoint
 * confirmado empiricamente (2026-05-21) que devolve telefone do comprador
 * pra uma transação específica. `sales-history` NÃO traz telefone.
 *
 * Doc: https://developers.hotmart.com/docs/en/v1/sales/sales-history/
 */
import { getAccessToken, invalidateAccessTokenCache } from "./oauth";

const BASE_URL = "https://developers.hotmart.com/payments/api/v1/sales/history";
const USERS_URL = "https://developers.hotmart.com/payments/api/v1/sales/users";
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

/**
 * Busca dados do comprador (cellphone/phone) de uma transação específica.
 * Retorna `null` se a request 404 ou se não tiver BUYER no payload.
 *
 * O endpoint devolve users[] com vários roles (PRODUCER, BUYER, AFFILIATE...);
 * só nos interessa o BUYER. Phone vem sem prefixo de país (ex: "11940814352"),
 * cabe ao chamador normalizar via `normalizePhone()`.
 */
export async function fetchBuyerPhone(
  transactionId: string,
): Promise<{ phone: string | null; email: string | null } | null> {
  const url = `${USERS_URL}?transaction=${encodeURIComponent(transactionId)}&max_results=5`;
  let retried401 = false;

  for (;;) {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && !retried401) {
      invalidateAccessTokenCache();
      retried401 = true;
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`hotmart sales/users (${transactionId}): ${res.status} ${body}`);
    }

    const data = (await res.json()) as {
      items?: Array<{
        users?: Array<{
          role?: string;
          user?: { cellphone?: string; phone?: string; email?: string };
        }>;
      }>;
    };
    const buyer = data.items?.[0]?.users?.find((u) => u.role === "BUYER")?.user;
    if (!buyer) return null;
    // A API devolve o campo vazio como "" (não null), e pro comprador o número
    // costuma vir em `phone` com `cellphone: ""` (ou vice-versa). `??` não cai
    // pro fallback em string vazia — usar `||` sobre o valor já trimado.
    const phone =
      (buyer.cellphone && buyer.cellphone.trim()) ||
      (buyer.phone && buyer.phone.trim()) ||
      null;
    return {
      phone,
      email: buyer.email ?? null,
    };
  }
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
