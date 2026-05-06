import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { adAccounts } from "@/lib/schema/meta";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { accountId?: number; isActive?: boolean };
  if (typeof body.accountId !== "number" || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "accountId (number) and isActive (boolean) required" }, { status: 400 });
  }

  await db
    .update(adAccounts)
    .set({ isActive: body.isActive, updatedAt: new Date() })
    .where(eq(adAccounts.id, body.accountId));

  return NextResponse.json({ ok: true });
}
