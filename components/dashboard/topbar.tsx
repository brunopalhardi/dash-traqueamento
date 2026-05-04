import { Bell } from "lucide-react";

export function Topbar({ userEmail }: { userEmail: string }) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background sticky top-0 z-10">
      <div className="text-sm text-muted-foreground">Traqueamento</div>
      <div className="flex items-center gap-3">
        <button
          className="p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div className="text-sm text-foreground">{userEmail}</div>
      </div>
    </header>
  );
}
