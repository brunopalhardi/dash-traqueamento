import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fmt } from "./format";

interface Highlight {
  label: string;
  value: string;
  subtitle?: string;
  tone: "good" | "bad" | "neutral";
}

/**
 * 3 cards de destaque acima de cada tabela: melhor, pior, atenção.
 * Pensado pra leigo bater o olho e entender o que importa sem ler tabela.
 */
export function FunnelHighlights({ items }: { items: Highlight[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      {items.map((h, i) => {
        const Icon =
          h.tone === "good" ? TrendingUp : h.tone === "bad" ? TrendingDown : AlertTriangle;
        const tone =
          h.tone === "good"
            ? {
                border: "border-emerald-400/35",
                overlay: "bg-emerald-400/[0.05]",
                tagBg: "bg-emerald-400/15",
                tagText: "text-emerald-400",
                valueText: "text-emerald-400",
                tagLabel: "↑ líder",
              }
            : h.tone === "bad"
              ? {
                  border: "border-rose-400/35",
                  overlay: "bg-rose-400/[0.05]",
                  tagBg: "bg-rose-400/15",
                  tagText: "text-rose-400",
                  valueText: "text-rose-400",
                  tagLabel: "↓ pior",
                }
              : {
                  border: "border-amber-400/35",
                  overlay: "bg-amber-400/[0.04]",
                  tagBg: "bg-amber-400/15",
                  tagText: "text-amber-400",
                  valueText: "text-amber-400",
                  tagLabel: "⚠ atenção",
                };

        return (
          <div
            key={i}
            className={`relative rounded-md border ${tone.border} bg-card overflow-hidden p-4`}
          >
            <div className={`pointer-events-none absolute inset-0 ${tone.overlay}`} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                  {h.label}
                </div>
                <div
                  className={`font-mono font-medium tabular-nums text-2xl leading-none tracking-tight mt-2 ${tone.valueText}`}
                >
                  {h.value}
                </div>
                {h.subtitle && (
                  <div
                    className="text-xs text-muted-foreground mt-1.5 truncate"
                    title={h.subtitle}
                  >
                    {h.subtitle}
                  </div>
                )}
              </div>
              <div
                className={`font-mono text-[10px] tracking-wider px-1.5 py-1 rounded uppercase font-medium ${tone.tagBg} ${tone.tagText} inline-flex items-center gap-1 shrink-0`}
              >
                <Icon className="h-2.5 w-2.5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Helpers para computar highlights ─── */

interface Item {
  label: string;
  spend: number;
  purchase: number;
  initiateCheckout?: number;
  landingPageView?: number;
  clicks?: number;
}

/**
 * Best/worst de CPA entre items com gasto significativo (>R$50 e ≥1 compra).
 */
export function highlightsByCpa(items: Item[]): Highlight[] {
  const significant = items.filter((i) => i.spend >= 50 && i.purchase >= 1);
  if (significant.length === 0) return [];

  const sorted = [...significant].sort((a, b) => a.spend / a.purchase - b.spend / b.purchase);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const out: Highlight[] = [];
  out.push({
    label: "Melhor CPA",
    value: fmt.money(best.spend / best.purchase),
    subtitle: best.label,
    tone: "good",
  });
  if (worst && worst !== best) {
    out.push({
      label: "Pior CPA",
      value: fmt.money(worst.spend / worst.purchase),
      subtitle: worst.label,
      tone: "bad",
    });
  }

  const zeroPurchase = items
    .filter((i) => i.purchase === 0 && i.spend >= 50)
    .sort((a, b) => b.spend - a.spend)[0];
  if (zeroPurchase) {
    out.push({
      label: "Maior gasto · 0 compras",
      value: fmt.money(zeroPurchase.spend),
      subtitle: zeroPurchase.label,
      tone: "neutral",
    });
  }
  return out;
}
