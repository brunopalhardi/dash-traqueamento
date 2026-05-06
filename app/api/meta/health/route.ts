import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "META_SYSTEM_USER_TOKEN not set" });

  try {
    const client = createMetaClient({ token, graphVersion: process.env.META_GRAPH_VERSION });
    const me = await client.getMe();
    return NextResponse.json({ ok: true, me });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
