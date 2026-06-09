"use client";
import { useState } from "react";

interface UnmappedPage { pageId: number; pageUrl: string; scrapeStatus: string }
interface PlayerOpt { playerId: string; name: string | null }

export function VturbMapping({ pages, players }: { pages: UnmappedPage[]; players: PlayerOpt[] }) {
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  if (pages.length === 0) {
    return <p className="text-sm text-muted-foreground">Todas as páginas ativas estão mapeadas. ✅</p>;
  }
  async function save(pageId: number, playerId: string) {
    const res = await fetch("/api/vturb/map", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, playerId }),
    });
    if (res.ok) setSaved((s) => ({ ...s, [pageId]: true }));
  }
  return (
    <div className="space-y-3">
      {pages.map((p) => (
        <div key={p.pageId} className="flex items-center gap-3 text-sm">
          <span className="font-mono text-xs flex-1 truncate">{p.pageUrl}</span>
          <select className="bg-card border border-border rounded px-2 py-1 text-xs"
            defaultValue="" onChange={(e) => e.target.value && save(p.pageId, e.target.value)}>
            <option value="" disabled>escolher player…</option>
            {players.map((pl) => <option key={pl.playerId} value={pl.playerId}>{pl.name ?? pl.playerId}</option>)}
          </select>
          {saved[p.pageId] && <span className="text-emerald-400 text-xs">salvo ✓</span>}
        </div>
      ))}
    </div>
  );
}
