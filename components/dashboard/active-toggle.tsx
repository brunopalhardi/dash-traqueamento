"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function ActiveToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const enabled = sp.get("active") === "1";

  const toggle = () => {
    const params = new URLSearchParams(sp);
    if (enabled) params.delete("active");
    else params.set("active", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors",
        enabled
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-border/60 bg-card text-muted-foreground hover:bg-card/80",
      )}
      title="Mostra só campanhas / criativos / páginas ATIVAS no Meta"
    >
      <Zap
        className={cn(
          "h-3 w-3",
          enabled ? "fill-emerald-400 text-emerald-400" : "",
        )}
      />
      Só ativos
    </button>
  );
}
