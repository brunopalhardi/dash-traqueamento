"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, RefreshCw, LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  "": "Visão Geral",
  desafio: "Desafio",
  guia: "Guia",
  settings: "Configurações",
  integrations: "Integrações",
};

interface Crumb {
  label: string;
  href: string | null; // null = não-clicável (último ou segmento desconhecido)
}

function breadcrumbsFrom(pathname: string): Crumb[] {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return [{ label: "Visão Geral", href: null }];
  return segs.map((s, i) => {
    const isLast = i === segs.length - 1;
    const known = s in LABELS;
    const label = LABELS[s] ?? s.replace(/-/g, " ");
    // só liga em segmentos conhecidos que tenham rota real (evita "criativo"
    // virar link pra /desafio/criativo, que não existe)
    const href = known && !isLast ? "/" + segs.slice(0, i + 1).join("/") : null;
    return { label, href };
  });
}

export function Topbar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs: Crumb[] = [
    { label: "OBA - Tráfego", href: pathname === "/" ? null : "/" },
    ...breadcrumbsFrom(pathname),
  ];
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/refresh-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "manual" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { status?: string; results?: unknown[] };
      toast.success(
        json.status === "done"
          ? "Sincronização concluída."
          : "Sincronização finalizada com avisos — confira em Configurações.",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na sincronização");
    } finally {
      setSyncing(false);
    }
  }

  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background sticky top-0 z-10">
      <nav className="flex items-center gap-2 text-sm">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          const baseCls = isLast
            ? "text-foreground font-medium"
            : "text-muted-foreground";
          return (
            <span key={i} className="flex items-center gap-2">
              {c.href ? (
                <Link
                  href={c.href}
                  className={cn(baseCls, "hover:text-foreground transition-colors")}
                >
                  {c.label}
                </Link>
              ) : (
                <span className={baseCls}>{c.label}</span>
              )}
              {!isLast ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              ) : null}
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            "inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium transition-colors",
            "bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-60",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>

        <div className="inline-flex items-center gap-2 h-8 px-2 pr-3 rounded-md bg-card border border-border/60">
          <div className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary">
            {initial}
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">{userEmail}</span>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            title="Sair"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </header>
  );
}
