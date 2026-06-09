import Link from "next/link";
import { notFound } from "next/navigation";
import { getPageRetention } from "@/lib/queries/vturb";
import { parseRangeFromSearchParams } from "@/lib/utils/date-ranges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RetentionCurve } from "@/components/dashboard/retention-curve";
import { fmt } from "@/components/dashboard/format";

export const dynamic = "force-dynamic";

function mmss(sec: number): string {
  if (!sec || sec <= 0) return "—";
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

export default async function PaginaDetail({
  params, searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ preset?: string; start?: string; end?: string }>;
}) {
  const { pageId } = await params;
  const sp = await searchParams;
  const { range } = parseRangeFromSearchParams(sp);
  const data = await getPageRetention(Number(pageId), range);
  if (!data) notFound();

  const lastAvg = data.dailyEngagement.at(-1)?.avgWatchedSec ?? 0;

  return (
    <>
      <Link href="/guia" className="font-mono text-xs text-muted-foreground hover:text-foreground">← Páginas ativas</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{data.pageUrl}</h1>
      <p className="font-mono text-xs text-muted-foreground mb-6">
        duração {mmss(data.durationSec)}{data.pitchPct != null ? ` · pitch em ${data.pitchPct.toFixed(0)}%` : " · pitch não configurado"}
      </p>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Curva de retenção · % da audiência ao longo do vídeo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RetentionCurve curve={data.curve} pitchPct={data.pitchPct} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Evolução diária · tempo médio (último: {mmss(lastAvg)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm font-mono">
            <thead><tr className="text-[10px] uppercase text-muted-foreground/70">
              <th className="text-left py-2">Dia</th><th className="text-right">Tempo médio</th><th className="text-right">Engaj.</th>
            </tr></thead>
            <tbody>
              {data.dailyEngagement.map((d) => (
                <tr key={d.date} className="border-t border-border/40">
                  <td className="py-2">{fmt.shortDate(d.date)}</td>
                  <td className="text-right">{mmss(d.avgWatchedSec)}</td>
                  <td className="text-right">{fmt.pct1(d.engagementRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
