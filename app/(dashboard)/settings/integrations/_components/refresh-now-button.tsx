"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function RefreshNowButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function run() {
    setLoading(true);
    const res = await fetch("/api/sync/refresh-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    await res.json();
    setLoading(false);
    router.refresh();
  }

  return (
    <Button onClick={run} disabled={loading}>
      {loading ? "Sincronizando…" : "Atualizar Agora"}
    </Button>
  );
}
