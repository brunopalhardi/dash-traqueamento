import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAccessToken, invalidateAccessTokenCache } from "./oauth";

const TOKEN_RESPONSE = {
  access_token: "fake-token-xyz",
  expires_in: 86400,
  token_type: "Bearer",
};

beforeEach(() => {
  invalidateAccessTokenCache();
  process.env.HOTMART_CLIENT_ID = "test-client-id";
  process.env.HOTMART_CLIENT_SECRET = "test-client-secret";
  vi.restoreAllMocks();
});

describe("getAccessToken", () => {
  it("faz request OAuth na primeira chamada e devolve o token", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 }),
    );
    const token = await getAccessToken();
    expect(token).toBe("fake-token-xyz");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("api-sec-vlc.hotmart.com/security/oauth/token");
    expect(String(url)).toContain("grant_type=client_credentials");
    expect(String(url)).toContain("client_id=test-client-id");
    expect((init as RequestInit).method).toBe("POST");
    const auth = (init as RequestInit).headers as Record<string, string>;
    // base64("test-client-id:test-client-secret")
    expect(auth.Authorization).toBe(
      "Basic " + Buffer.from("test-client-id:test-client-secret").toString("base64"),
    );
  });

  it("usa cache na segunda chamada (não chama fetch de novo)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 }),
    );
    await getAccessToken();
    await getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renova quando o cache está perto da expiração", async () => {
    // expires_in: 30 → cache válido por (30-60)s = expira imediato
    const shortTtl = { ...TOKEN_RESPONSE, expires_in: 30 };
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(shortTtl), { status: 200 }),
    );
    await getAccessToken();
    await getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("lança erro com status e body quando OAuth falha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("invalid_client", { status: 401 }),
    );
    await expect(getAccessToken()).rejects.toThrow(/hotmart oauth.*401.*invalid_client/);
  });

  it("lança erro se HOTMART_CLIENT_ID estiver faltando", async () => {
    delete process.env.HOTMART_CLIENT_ID;
    await expect(getAccessToken()).rejects.toThrow(/HOTMART_CLIENT_ID/);
  });

  it("lança erro quando resposta vem malformada (sem access_token)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ expires_in: 86400 }), { status: 200 }),
    );
    await expect(getAccessToken()).rejects.toThrow(/hotmart oauth: resposta inválida/);
  });
});
