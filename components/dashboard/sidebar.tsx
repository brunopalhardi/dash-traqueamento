"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Moon,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Geral", icon: LayoutDashboard },
  { href: "/c1", label: "C1 — Atração", icon: Users },
  { href: "/desafio", label: "Desafio", icon: Calendar },
  { href: "/sono", label: "Sono", icon: Moon },
  { href: "/guia", label: "Guia", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col py-4 sticky top-0 h-screen">
      <div className="px-5 pb-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Traqueamento</div>
        <div className="text-sm font-semibold text-sidebar-foreground mt-0.5">O Bom do Alzheimer</div>
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
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40",
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pt-3 border-t border-sidebar-border flex flex-col gap-0.5">
        <Link
          href="/settings/integrations"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40",
          )}
        >
          <Settings className="h-4 w-4" />
          Configurações
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
