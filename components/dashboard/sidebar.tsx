"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Target, Film, Filter, Database, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/gerenciador", label: "Gerenciador", icon: Target },
  { href: "/criativos", label: "Criativos", icon: Film },
  { href: "/funis", label: "Funis", icon: Filter },
  { href: "/fontes", label: "Fontes de dados", icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-16 bg-background border-r border-border flex flex-col items-center py-4 gap-1 sticky top-0 h-screen">
      {items.map((it) => {
        const Icon = it.icon;
        const active =
          it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            title={it.label}
            className={cn(
              "p-2.5 rounded-md transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
      <div className="flex-1" />
      <form action={signOut}>
        <button
          type="submit"
          title="Sair"
          className="p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </form>
    </aside>
  );
}
