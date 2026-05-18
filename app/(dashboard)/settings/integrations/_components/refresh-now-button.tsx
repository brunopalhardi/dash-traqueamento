"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// Vercel mata a função em 300s. Damos uma folga de 10s pro fetch desistir
// antes da Vercel — assim a UI mostra erro em vez de só travar.
const FETCH_TIMEOUT_MS = 310_000;

export function RefreshNowButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/sync/refresh-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual" }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      await res.json();
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "timeout (>5min) — sync provavelmente morreu na Vercel, recarrega a página pra ver status do job"
            : e.message
          : String(e);
      setError(msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={loading}>
        {loading ? "Sincronizando… (pode levar até 5min)" : "Atualizar Agora"}
      </Button>
      {error ? <p className="text-sm text-destructive">Erro: {error}</p> : null}
    </div>
  );
}
