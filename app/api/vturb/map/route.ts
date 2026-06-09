import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { vturbPagePlayers } from "@/lib/schema/vturb";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { pageId, playerId } = await req.json();
  if (!pageId || !playerId) return NextResponse.json({ error: "pageId e playerId obrigatórios" }, { status: 400 });

  // remove mapeamentos auto da página e grava o manual
  await db.delete(vturbPagePlayers).where(and(eq(vturbPagePlayers.pageId, Number(pageId)), eq(vturbPagePlayers.source, "auto")));
  await db.insert(vturbPagePlayers).values({ pageId: Number(pageId), playerId, source: "manual" }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
