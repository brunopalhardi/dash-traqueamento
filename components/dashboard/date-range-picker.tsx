"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

const PRESETS: Array<{ value: string; label: string; days: number }> = [
  { value: "1", label: "Hoje", days: 1 },
  { value: "7", label: "7d", days: 7 },
  { value: "14", label: "14d", days: 14 },
  { value: "30", label: "30d", days: 30 },
  { value: "90", label: "90d", days: 90 },
];

export function DateRangePicker({ defaultDays = 7 }: { defaultDays?: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const current = sp.get("range") ?? String(defaultDays);

  const set = (val: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("range", val);
    start(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border/70 bg-card/40 p-1 text-xs",
        pending && "opacity-70",
      )}
    >
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => set(p.value)}
          className={cn(
            "px-2.5 py-1 rounded-sm transition-colors",
            current === p.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
