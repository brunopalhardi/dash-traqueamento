"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, LogOut, Home } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  "": "Visão Geral",
  desafio: "Desafio",
  guia: "Guia",
  settings: "Configurações",
  integrations: "Integrações",
  criativo: "Criativo",
};

interface Crumb {
  label: string;
  href: string | null;
}

function breadcrumbsFrom(pathname: string): Crumb[] {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return [{ label: "Visão Geral", href: null }];
  return segs.map((s, i) => {
    const isLast = i === segs.length - 1;
    const known = s in LABELS;
    const label = LABELS[s] ?? s.replace(/-/g, " ");
    const href = known && !isLast ? "/" + segs.slice(0, i + 1).join("/") : null;
    return { label, href };
  });
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

export function Topbar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs: Crumb[] = breadcrumbsFrom(pathname);
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

  const initial = (userEmail.charAt(0) || "?").toUpperCase();
  const hue = hashHue(userEmail);
  const avatarBg = `linear-gradient(135deg, hsl(${hue}, 55%, 50%) 0%, hsl(${(hue + 20) % 360}, 60%, 38%) 100%)`;

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background sticky top-0 z-10">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5">
        <Link
          href="/"
          className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground/60 hover:text-foreground transition-colors"
          title="Início"
        >
          <Home className="h-3 w-3" />
        </Link>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground/40">/</span>
              {c.href ? (
                <Link
                  href={c.href}
                  className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors lowercase tracking-wide"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "font-mono text-[11px] tracking-wide",
                    isLast
                      ? "text-foreground font-medium lowercase"
                      : "text-muted-foreground lowercase",
                  )}
                >
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            "inline-flex items-center gap-2 h-8 px-3 rounded-md font-mono text-[11px] tracking-wide font-medium transition-colors lowercase",
            "border border-border bg-card text-foreground disabled:opacity-50",
            "hover:bg-white/[0.04] hover:border-white/15",
          )}
          title="Sincronizar Meta agora (manual)"
        >
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          {syncing ? "sincronizando…" : "sincronizar"}
        </button>

        {/* User pill */}
        <div className="inline-flex items-center gap-2 h-8 pl-1 pr-3 rounded-md border border-border bg-card">
          <div
            className="h-6 w-6 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold text-white border border-white/10"
            style={{ background: avatarBg }}
          >
            {initial}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground hidden sm:inline tabular-nums">
            {userEmail}
          </span>
        </div>

        {/* Logout */}
        <form action={signOut}>
          <button
            type="submit"
            title="Sair"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-transparent hover:border-border text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <LogOut className="h-3 w-3" />
          </button>
        </form>
      </div>
    </header>
  );
}
