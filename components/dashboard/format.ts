const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const intCompact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const fmt = {
  money(v: number, compact = false): string {
    if (!isFinite(v)) return "—";
    return compact ? brlCompact.format(v) : brl.format(v);
  },
  int(v: number, compact = false): string {
    if (!isFinite(v)) return "—";
    return compact ? intCompact.format(v) : intFmt.format(v);
  },
  pct(v: number, fractionDigits = 1): string {
    if (!isFinite(v)) return "—";
    return v.toLocaleString("pt-BR", {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }) + "%";
  },
  ratio(v: number, fractionDigits = 2): string {
    if (!isFinite(v) || v === 0) return "—";
    return v.toLocaleString("pt-BR", {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    });
  },
  delta(curr: number, prev: number): { label: string; positive: boolean } | null {
    if (!isFinite(curr) || !isFinite(prev) || prev === 0) return null;
    const diff = ((curr - prev) / prev) * 100;
    const sign = diff >= 0 ? "+" : "";
    return {
      label: `${sign}${diff.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })}%`,
      positive: diff >= 0,
    };
  },
  shortDate(iso: string): string {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  },
};
