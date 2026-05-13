"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

const PRESETS: Array<{ value: string; label: string }> = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
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
        "inline-flex items-center rounded-md bg-card border border-border/60 p-0.5 text-xs",
        pending && "opacity-70",
      )}
    >
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => set(p.value)}
          className={cn(
            "px-3 py-1.5 rounded-sm transition-colors font-medium",
            current === p.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
