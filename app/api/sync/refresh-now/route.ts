import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { syncMeta, type SyncMode } from "@/lib/sync/syncMeta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });
  }

  let mode: SyncMode = "manual";
  try {
    const body = (await req.json()) as { mode?: SyncMode };
    if (body?.mode === "backfill" || body?.mode === "manual") mode = body.mode;
  } catch {
    /* no body, use default */
  }

  const client = createMetaClient({
    token,
    graphVersion: process.env.META_GRAPH_VERSION,
  });
  const result = await syncMeta({ mode, client });
  return NextResponse.json(result);
}
