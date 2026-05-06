"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Health {
  ok: boolean;
  me?: { id: string; name: string };
  error?: string;
}

export function TokenStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/meta/health").then((r) => r.json()).then(setHealth);
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status do token</CardTitle>
      </CardHeader>
      <CardContent>
        {health === null ? (
          <p className="text-sm text-muted-foreground">Verificando…</p>
        ) : health.ok ? (
          <div className="flex items-center gap-2">
            <Badge variant="default">● Conectado</Badge>
            <span className="text-sm text-muted-foreground">{health.me?.name}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <Badge variant="destructive">● Desconectado</Badge>
            <p className="text-sm text-destructive">{health.error}</p>
            <p className="text-xs text-muted-foreground">Revise o env var META_SYSTEM_USER_TOKEN na Vercel.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
