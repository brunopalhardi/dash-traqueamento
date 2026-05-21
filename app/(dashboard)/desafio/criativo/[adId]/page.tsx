import { notFound } from "next/navigation";
import { getAdDetail, getTopAds } from "@/lib/queries/dashboard";
import { parseRangeFromSearchParams } from "@/lib/utils/date-ranges";
import { CreativeList } from "@/components/dashboard/creative-list";
import { CreativeDetailEmpty, CreativeDetailPanel } from "@/components/dashboard/creative-detail-panel";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

export default async function DesafioCreativeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ adId: string }>;
  searchParams: Promise<{ preset?: string; cycle?: string; start?: string; end?: string }>;
}) {
  const { adId: adIdRaw } = await params;
  const adId = Number(adIdRaw);
  if (!Number.isFinite(adId)) notFound();

  const sp = await searchParams;
  const { range } = parseRangeFromSearchParams(sp);

  const [detail, ranking] = await Promise.all([
    getAdDetail(adId, range),
    getTopAds("desafio", range, { limit: 100, orderBy: "spend" }),
  ]);

  return (
    <>
      <PageHeader
        title="Análise de criativos"
        subtitle="Desafio · clique nos criativos pra comparar métricas"
        hidePicker
      />
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <CreativeList ads={ranking} basePath="/desafio/criativo" activeAdId={adId} />
        {detail ? <CreativeDetailPanel ad={detail} /> : <CreativeDetailEmpty />}
      </div>
    </>
  );
}
