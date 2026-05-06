"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface AccountRow {
  id: number;
  name: string;
  metaAccountId: string;
  status: string;
  isActive: boolean;
}

export function AccountsTable() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function discover() {
    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch("/api/meta/accounts/discover");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      setAccounts((data.accounts ?? []) as AccountRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/meta/accounts/list")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAccounts((data.accounts ?? []) as AccountRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(id: number, isActive: boolean) {
    await fetch("/api/meta/accounts/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: id, isActive }),
    });
    setAccounts((prev) => prev?.map((a) => (a.id === id ? { ...a, isActive } : a)) ?? null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contas de anúncio</CardTitle>
        <Button variant="outline" size="sm" onClick={discover} disabled={discovering}>
          {discovering ? "Atualizando…" : "Recarregar lista"}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive mb-2">Erro: {error}</p>
        ) : null}
        {accounts === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sincronizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="font-mono text-xs">{a.metaAccountId}</TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>
                    <Switch checked={a.isActive} onCheckedChange={(v) => toggle(a.id, v)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
