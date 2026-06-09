import Link from "next/link";
import { fmt } from "./format";

export interface PageVideoTableRow {
  pageId: number;
  host: string;
  path: string;
  health: "ok" | "no_embed" | "http_error";
  lastHttpStatus: number | null;
  spend: number;
  purchase: number;
  avgWatchedSec: number;
  playRate: number;
  engagementRate: number;
  pitchRetentionRate: number | null;
  hasVideo: boolean;
}

function mmss(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const total = Math.round(sec); // arredonda antes de dividir pra não gerar "3:60"
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Badge({ health, status }: { health: PageVideoTableRow["health"]; status: number | null }) {
  const map = {
    ok: { c: "bg-emerald-400", t: "mapeado" },
    no_embed: { c: "bg-amber-400", t: "sem player — mapear manual" },
    http_error: { c: "bg-rose-400", t: `página quebrada${status ? ` (${status})` : ""}` },
  }[health];
  return <span className="inline-flex items-center gap-2" title={map.t}><span className={`h-2 w-2 rounded-full ${map.c}`} /></span>;
}

export function PagesVideoTable({ rows }: { rows: PageVideoTableRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem páginas ativas no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
            <th className="text-left py-3 px-3 font-medium">Página</th>
            <th className="text-right py-3 px-3 font-medium">Gasto</th>
            <th className="text-right py-3 px-3 font-medium">Vendas*</th>
            <th className="text-right py-3 px-3 font-medium">CPA</th>
            <th className="text-right py-3 px-3 font-medium">Tempo médio</th>
            <th className="text-right py-3 px-3 font-medium">Play rate</th>
            <th className="text-right py-3 px-3 font-medium">Engaj.</th>
            <th className="text-right py-3 px-3 font-medium">% pitch</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r) => (
            <tr key={r.pageId} className="border-t border-border/40 hover:bg-white/[0.02]">
              <td className="py-3 px-3">
                <Link href={`/guia/pagina/${r.pageId}`} className="flex items-center gap-2 group">
                  <Badge health={r.health} status={r.lastHttpStatus} />
                  <span>
                    <span className="text-foreground group-hover:underline">{r.host}</span>
                    <span className="block text-[11px] text-muted-foreground/60">{r.path}</span>
                  </span>
                </Link>
              </td>
              <td className="text-right px-3">{fmt.money(r.spend)}</td>
              <td className="text-right px-3">{fmt.int(r.purchase)}</td>
              <td className="text-right px-3">{r.purchase > 0 ? fmt.money(r.spend / r.purchase) : "—"}</td>
              <td className="text-right px-3">{r.hasVideo ? mmss(r.avgWatchedSec) : "—"}</td>
              <td className="text-right px-3">{r.hasVideo ? fmt.pct1(r.playRate) : "—"}</td>
              <td className="text-right px-3">{r.hasVideo ? fmt.pct1(r.engagementRate) : "—"}</td>
              <td className="text-right px-3">{r.pitchRetentionRate != null ? fmt.pct1(r.pitchRetentionRate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground/60 mt-3">
        🟢 mapeado · 🟡 sem player (mapear em settings) · 🔴 página quebrada · <b>* vendas = pixel do Meta</b> (compara páginas; KPIs do topo seguem Hotmart).
      </p>
    </div>
  );
}
