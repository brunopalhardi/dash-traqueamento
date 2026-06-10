import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { syncMeta } from "@/lib/sync/syncMeta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-sync semanal com janela de 28 dias: o Meta reatribui conversões
// retroativamente, então dias "fechados" pelo daily (last_7d) ainda mudam.

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });
  }
  const client = createMetaClient({
    token,
    graphVersion: process.env.META_GRAPH_VERSION,
  });
  const result = await syncMeta({ mode: "weekly", client });
  return NextResponse.json(result);
}

export const GET = POST;
