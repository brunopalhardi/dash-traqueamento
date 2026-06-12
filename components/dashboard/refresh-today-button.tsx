"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

// Vercel mata a função em 300s; 10s de folga pro fetch desistir antes.
const FETCH_TIMEOUT_MS = 310_000;

/**
 * Puxa o gasto de HOJE do Meta sob demanda (date_preset=today) e recarrega a
 * página com ?hoje=1 — que faz a janela incluir o dia corrente (parcial).
 *
 * No plano Hobby da Vercel não dá cron intradiário, então o gasto de hoje só
 * entra quando o Bruno clica aqui. Sem clicar, o dash mostra dias completos
 * (até ontem), que reconciliam 1:1 com o Gerenciador.
 */
export function RefreshTodayButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const incluindoHoje = searchParams.get("hoje") === "1";

  async function run() {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/sync/refresh-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      await res.json();
      const params = new URLSearchParams(searchParams.toString());
      params.set("hoje", "1");
      router.push(`${pathname}?${params.toString()}`);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "timeout (>5min) — recarrega a página"
            : e.message
          : String(e);
      setError(msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function voltarCompletos() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("hoje");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {incluindoHoje ? (
          <button
            type="button"
            onClick={voltarCompletos}
            className="font-mono text-[10px] tracking-wide text-muted-foreground/70 hover:text-foreground lowercase"
          >
            ← dias completos
          </button>
        ) : null}
        <Button variant="outline" size="sm" onClick={run} disabled={loading}>
          {loading ? "puxando hoje…" : incluindoHoje ? "↻ hoje" : "↻ atualizar hoje"}
        </Button>
      </div>
      {error ? (
        <p className="text-[10px] text-destructive max-w-[220px] text-right">{error}</p>
      ) : null}
    </div>
  );
}
