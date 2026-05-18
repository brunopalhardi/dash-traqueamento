/**
 * Endpoint do sync de sales-history do Hotmart.
 *
 * Auth via CRON_SECRET (header Authorization: Bearer ...) ou sessão Supabase.
 * Aceita ?days=N (default 1, max 90). Roda inline com maxDuration=60s — pra
 * volumes maiores, mover pra Upstash queue depois.
 *
 * GET = POST: Vercel Cron dispara via GET com Authorization header injetado.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSalesHistory } from "@/lib/hotmart/sync";

export const dynamic = "force-dynamic";
// 300s = limite do Vercel Pro. Necessário pra backfill grande (365d × ~2k vendas).
// Cron diário (days=1) roda em poucos segundos.
export const maxDuration = 300;

const DEFAULT_DAYS = 1;
const MAX_DAYS = 365;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  // Se o caller mandou um Bearer (mesmo que errado), não tenta fallback Supabase —
  // simplifica a policy: cron usa Bearer, UI usa cookie de sessão, nunca os dois.
  if (auth?.startsWith("Bearer ")) return false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    // cookies() fora de request scope (ex.: testes unitários) — sem sessão.
    return false;
  }
}

function parseDays(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("days");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(n, MAX_DAYS);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = parseDays(req);
  try {
    const stats = await syncSalesHistory({ days });
    return NextResponse.json({ ok: true, days, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hotmart-sync] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Vercel Cron dispara via GET. Aceita o mesmo handler — auth obrigatória.
export const GET = POST;
