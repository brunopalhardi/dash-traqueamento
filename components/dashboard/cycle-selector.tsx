"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS: Array<{ value: string; label: string }> = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "15", label: "15 dias" },
];

interface Props {
  defaultCycle?: number;
}

export function CycleSelector({ defaultCycle = 7 }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);

  const spStart = sp.get("start");
  const spEnd = sp.get("end");
  const spCycle = sp.get("cycle");

  const isCustom = Boolean(spStart && spEnd);
  const currentCycle = isCustom ? "custom" : (spCycle ?? String(defaultCycle));

  const [from, setFrom] = useState(spStart ?? "");
  const [to, setTo] = useState(spEnd ?? "");

  useEffect(() => {
    if (isCustom) setCustomOpen(true);
  }, [isCustom]);

  const setCycle = (val: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("cycle", val);
    next.delete("start");
    next.delete("end");
    setCustomOpen(false);
    start(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };

  const applyCustom = () => {
    if (!from || !to) return;
    const next = new URLSearchParams(sp.toString());
    next.set("start", from);
    next.set("end", to);
    next.delete("cycle");
    start(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className={cn("inline-flex items-center gap-2", pending && "opacity-70")}>
      <div className="inline-flex items-center rounded-md bg-card border border-border/60 p-0.5 text-xs">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setCycle(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-sm transition-colors font-medium",
              currentCycle === p.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          className={cn(
            "px-3 py-1.5 rounded-sm transition-colors font-medium inline-flex items-center gap-1.5",
            isCustom
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Calendar className="h-3 w-3" />
          Custom
        </button>
      </div>

      {customOpen ? (
        <div className="inline-flex items-center gap-1.5 rounded-md bg-card border border-border/60 px-2 py-1 text-xs">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-transparent text-foreground outline-none w-32 [color-scheme:dark]"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-transparent text-foreground outline-none w-32 [color-scheme:dark]"
          />
          <button
            onClick={applyCustom}
            disabled={!from || !to}
            className="ml-1 px-2 py-1 rounded-sm bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      ) : null}
    </div>
  );
}
