import { describe, it, expect, vi } from "vitest";
import { createVturbClient } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status, ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe("createVturbClient", () => {
  it("listPlayers manda headers de auth e parseia", async () => {
    const fetchImpl = mockFetch(200, [
      { id: "6a13a0b8fdf7a4c849eb57ba", name: "Vsl V3", pitch_time: 520, duration: 862, created_at: "2026-05-25 01:07:04" },
    ]);
    const c = createVturbClient({ token: "TKN", fetchImpl, sleep: async () => {} });
    const players = await c.listPlayers();
    expect(players[0].playerId).toBe("6a13a0b8fdf7a4c849eb57ba");
    expect(players[0].durationSec).toBe(862);
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>)["X-Api-Token"]).toBe("TKN");
    expect((init.headers as Record<string, string>)["X-Api-Version"]).toBe("v1");
  });

  it("sessionStatsByDay parseia strings em número", async () => {
    const fetchImpl = mockFetch(200, [
      { date_key: "2026-06-01", total_viewed: 100, total_started: 40, total_finished: 2,
        total_clicked: 5, total_over_pitch: 5, total_under_pitch: 35, engagement_rate: "11.88", play_rate: "47.05" },
    ]);
    const c = createVturbClient({ token: "TKN", fetchImpl, sleep: async () => {} });
    const rows = await c.sessionStatsByDay({ playerId: "p", startDate: "2026-06-01", endDate: "2026-06-07" });
    expect(rows[0]).toMatchObject({ date: "2026-06-01", views: 100, plays: 40, engagementRate: 11.88 });
  });

  it("401 vira erro de auth", async () => {
    const fetchImpl = mockFetch(401, { error: "unauthorized" });
    const c = createVturbClient({ token: "BAD", fetchImpl, sleep: async () => {} });
    await expect(c.listPlayers()).rejects.toThrow(/auth/i);
  });
});
