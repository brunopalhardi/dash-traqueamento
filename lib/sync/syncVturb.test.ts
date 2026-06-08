import { describe, it, expect, vi } from "vitest";
import { resolvePageMapping } from "./syncVturb";

describe("resolvePageMapping", () => {
  it("não raspa página que já tem mapeamento manual", async () => {
    const fetchSpy = vi.fn();
    const r = await resolvePageMapping(
      { pageUrl: "https://x.lovable.app/", hasManual: true },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toEqual({ skipped: true });
  });
  it("raspa e devolve players quando não tem manual", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, text: async () => "players/6a13a0b8fdf7a4c849eb57ba/v4" } as Response);
    const r = await resolvePageMapping({ pageUrl: "https://x.lovable.app/", hasManual: false }, fetchImpl);
    expect(r).toMatchObject({ skipped: false, scrape: { status: "ok", players: ["6a13a0b8fdf7a4c849eb57ba"] } });
  });
});
