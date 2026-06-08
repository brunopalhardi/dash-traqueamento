import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVturbClient } from "@/lib/vturb/client";
import { syncVturb, type VturbSyncMode } from "@/lib/sync/syncVturb";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

function parseMode(req: NextRequest): VturbSyncMode {
  const v = req.nextUrl.searchParams.get("mode");
  if (v === "backfill" || v === "manual" || v === "daily") return v;
  return "daily";
}

function rangeFor(mode: VturbSyncMode): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = mode === "backfill" ? 30 : 2;
  from.setDate(to.getDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.VTURB_API_TOKEN;
  if (!token) return NextResponse.json({ error: "VTURB_API_TOKEN not set" }, { status: 500 });

  const mode = parseMode(req);
  const client = createVturbClient({ token });
  try {
    const result = await syncVturb({ client, range: rangeFor(mode) });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vturb-sync] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = POST;
