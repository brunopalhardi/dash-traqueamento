import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { AdRow } from "@/lib/queries/dashboard";

interface TopCreativesGridProps {
  ads: AdRow[];
  limit?: number;
}

function roasColor(roas: number): string {
  if (roas >= 2) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (roas >= 1) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-rose-400 bg-rose-500/10 border-rose-500/30";
}

function adLibraryUrl(metaAdId: string): string {
  return `https://www.facebook.com/ads/library/?id=${metaAdId}`;
}

export function TopCreativesGrid({ ads, limit = 5 }: TopCreativesGridProps) {
  const top = [...ads]
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);

  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem criativos com gasto no período.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {top.map((ad) => {
        const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0;
        const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
        return (
          <a
            key={ad.adId}
            href={adLibraryUrl(ad.metaAdId)}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir no Facebook Ad Library"
            className="rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col hover:border-primary/40 transition-colors group"
          >
            <div className="aspect-square bg-muted/30 relative flex items-center justify-center">
              {ad.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ad.thumbnailUrl}
                  alt={ad.adName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">sem thumb</span>
              )}
              <span
                className={cn(
                  "absolute top-2 right-2 px-1.5 py-0.5 text-[10px] rounded border font-semibold tabular-nums",
                  roasColor(roas),
                )}
              >
                {fmt.ratio(roas)}
              </span>
              <ExternalLink className="absolute top-2 left-2 h-3.5 w-3.5 text-foreground/0 group-hover:text-foreground/80 transition-colors" />
            </div>
            <div className="p-2.5 flex-1 flex flex-col gap-1">
              <div className="text-xs font-medium truncate" title={ad.adName}>
                {ad.adName}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.int(ad.impressions, true)} imp</span>
                <span>CTR {fmt.pct(ctr, 1)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.money(ad.spend)}</span>
                <span>{fmt.int(ad.purchases)} vendas</span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
