"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Settings, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERSION, COMMIT_SHA } from "@/lib/version";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Texto curto em mono (ex.: "ATIVO") */
  badge?: string;
  badgeTone?: "good" | "warn" | "bad";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Dashboards",
    items: [
      { href: "/", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/guia", label: "Guia", icon: BookOpen, badge: "ATIVO", badgeTone: "good" },
    ],
  },
  {
    title: "Sistema",
    items: [{ href: "/settings/integrations", label: "Integrações", icon: Settings }],
  },
];

interface SidebarProps {
  /** Status do último sync Meta — passado pelo layout server component */
  lastSync?: {
    status: "done" | "failed" | "running" | "partial";
    finishedAt: Date | string | null;
  } | null;
}

function formatSyncTime(t: Date | string | null): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  if (!isFinite(d.getTime())) return "—";
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  if (diffMin < 60 * 24) {
    const h = Math.floor(diffMin / 60);
    return `${h}h atrás`;
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function badgeClasses(tone?: "good" | "warn" | "bad"): string {
  if (tone === "good") return "bg-emerald-400/12 text-emerald-400";
  if (tone === "warn") return "bg-amber-400/12 text-amber-400";
  if (tone === "bad") return "bg-rose-400/12 text-rose-400";
  return "bg-muted text-muted-foreground";
}

export function Sidebar({ lastSync }: SidebarProps = {}) {
  const pathname = usePathname();

  const syncTone =
    lastSync?.status === "done"
      ? "good"
      : lastSync?.status === "running" || lastSync?.status === "partial"
        ? "warn"
        : lastSync?.status === "failed"
          ? "bad"
          : "warn";
  const syncDot =
    syncTone === "good"
      ? "bg-emerald-400 shadow-[0_0_4px] shadow-emerald-400/80"
      : syncTone === "warn"
        ? "bg-amber-400"
        : "bg-rose-400";
  const syncLabel = !lastSync
    ? "sem sync"
    : lastSync.status === "done"
      ? `sync · ${formatSyncTime(lastSync.finishedAt)}`
      : lastSync.status === "partial"
        ? `sync parcial · ${formatSyncTime(lastSync.finishedAt)}`
        : lastSync.status === "running"
          ? "sincronizando…"
          : `falhou · ${formatSyncTime(lastSync.finishedAt)}`;

  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col sticky top-0 h-screen">
      {/* Brand block */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center border border-white/10"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
            }}
          >
            <span className="font-mono text-[10px] font-bold tracking-tight">OBA</span>
          </div>
          <div className="min-w-0">
            <div className="font-medium text-[13px] leading-none tracking-tight">
              Traqueamento
            </div>
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mt-1">
              tráfego pago + vendas
            </div>
          </div>
        </div>
        {/* Sync status */}
        <div className="flex items-center gap-2 mt-3 px-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", syncDot)} />
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70 lowercase">
            {syncLabel}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-5 overflow-y-auto">
        {SECTIONS.map((section, sIdx) => (
          <div key={section.title} className={sIdx > 0 ? "mt-7" : ""}>
            <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground/60 font-medium px-[22px] mb-2">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((it) => {
                const Icon = it.icon;
                const active =
                  it.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn(
                      "relative flex items-center gap-3 px-4 py-2 mx-3 rounded text-[13px] font-medium transition-colors group",
                      active
                        ? "text-foreground bg-white/[0.05]"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]",
                    )}
                  >
                    {/* Active rail */}
                    {active ? (
                      <span className="absolute -left-3 top-1.5 bottom-1.5 w-0.5 bg-foreground rounded-r" />
                    ) : null}
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 transition-colors shrink-0",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground/60 group-hover:text-foreground",
                      )}
                    />
                    <span className="truncate">{it.label}</span>
                    {it.badge ? (
                      <span
                        className={cn(
                          "ml-auto font-mono text-[9px] tracking-wider font-medium px-1.5 py-0.5 rounded uppercase",
                          badgeClasses(it.badgeTone),
                        )}
                      >
                        {it.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border space-y-3">
        <button
          type="button"
          className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors lowercase"
          title="Tema (em breve)"
        >
          <Sun className="h-3 w-3" />
          modo claro
        </button>
        <div className="flex items-center justify-between font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
          <span>v{VERSION}</span>
          <span className="text-muted-foreground/40">{COMMIT_SHA}</span>
        </div>
      </div>
    </aside>
  );
}
