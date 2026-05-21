/**
 * Endpoint do sync REST SendFlow (releases + grupos + analytics).
 *
 * Auth via CRON_SECRET (Bearer) ou sessão Supabase — mesmo padrão de
 * /api/sync/hotmart. Cron diário dispara via GET.
 *
 * Vai bater em ~6 calls de Meta (1 list releases + 2 por release × N releases),
 * com 250ms entre cada. Pra 5 releases ~5s. maxDuration=120 com folga grande.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSendflow } from "@/lib/sendflow/sync";

export const dynamic = "force-dynamic";
// SendFlow tem rate limit agressivo (~1 call/min). 10 releases × 2 calls
// com retries pode levar 5-10min. Margem de segurança ampla.
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (auth?.startsWith("Bearer ")) return false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.SENDFLOW_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "SENDFLOW_TOKEN not set" },
      { status: 500 },
    );
  }
  try {
    const stats = await syncSendflow({ token });
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sendflow-sync] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = POST;
