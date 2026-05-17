"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Settings,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/desafio", label: "Desafio", icon: Calendar },
  { href: "/guia", label: "Guia", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col py-6 sticky top-0 h-screen">
      {/* Brand */}
      <div className="px-6 pb-8 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm tracking-tight">
          OBA
        </div>
        <div>
          <div className="text-sm font-semibold text-sidebar-foreground leading-none">
            Traqueamento
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
            Performance Analytics
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 flex flex-col gap-0.5">
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {it.label}
              {active ? (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}

        <div className="mt-3 pt-3 border-t border-sidebar-border/60">
          <Link
            href="/settings/integrations"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              pathname.startsWith("/settings")
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 pt-4 border-t border-sidebar-border space-y-2">
        <button
          type="button"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Tema (em breve)"
        >
          <Sun className="h-3.5 w-3.5" />
          Modo Claro
        </button>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Traqueamento v0.3.0
        </div>
      </div>
    </aside>
  );
}
