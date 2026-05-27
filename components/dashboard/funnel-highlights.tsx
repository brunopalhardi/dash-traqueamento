import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fmt } from "./format";

interface Highlight {
  label: string;
  value: string;
  subtitle?: string;
  tone: "good" | "bad" | "neutral";
}

/**
 * Mostra 3 cartões de destaque acima de cada tabela:
 *  - melhor (verde, ↑)
 *  - pior (vermelho, ↓)
 *  - atenção (amarelo, ⚠) — opcional
 *
 * Pensado pra leigo bater o olho e entender o que importa sem ler tabela.
 */
export function FunnelHighlights({ items }: { items: Highlight[] }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
      {items.map((h, i) => {
        const Icon =
          h.tone === "good" ? TrendingUp : h.tone === "bad" ? TrendingDown : AlertTriangle;
        const tone =
          h.tone === "good"
            ? {
                ring: "ring-emerald-500/30 bg-emerald-500/[0.04]",
                icon: "text-emerald-400 bg-emerald-500/10",
                label: "text-emerald-400/80",
              }
            : h.tone === "bad"
              ? {
                  ring: "ring-rose-500/30 bg-rose-500/[0.04]",
                  icon: "text-rose-400 bg-rose-500/10",
                  label: "text-rose-400/80",
                }
              : {
                  ring: "ring-amber-500/30 bg-amber-500/[0.04]",
                  icon: "text-amber-400 bg-amber-500/10",
                  label: "text-amber-400/80",
                };
        return (
          <div
            key={i}
            className={`relative rounded-lg ring-1 ${tone.ring} p-3 flex items-start gap-3`}
          >
            <div className={`p-2 rounded-md ${tone.icon}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] font-medium uppercase tracking-wider ${tone.label}`}>
                {h.label}
              </div>
              <div className="text-lg font-semibold text-foreground tabular-nums leading-tight mt-0.5">
                {h.value}
              </div>
              {h.subtitle && (
                <div className="text-xs text-muted-foreground truncate mt-0.5" title={h.subtitle}>
                  {h.subtitle}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Helpers para computar highlights ─── */

interface Item {
  label: string; // identificador (ex: nome da campanha)
  spend: number;
  purchase: number;
  initiateCheckout?: number;
  landingPageView?: number;
  clicks?: number;
}

/**
 * Best/worst de CPA entre items com gasto significativo (>R$50 e ≥1 compra).
 * Ignora ruído de items pequenos.
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

  // Atenção: maior gasto sem compra
  const zeroPurchase = items
    .filter((i) => i.purchase === 0 && i.spend >= 50)
    .sort((a, b) => b.spend - a.spend)[0];
  if (zeroPurchase) {
    out.push({
      label: "Maior gasto s/ compra",
      value: fmt.money(zeroPurchase.spend),
      subtitle: zeroPurchase.label,
      tone: "neutral",
    });
  }
  return out;
}
