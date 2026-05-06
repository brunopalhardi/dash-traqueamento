import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createMetaClient } from "@/lib/meta/client";
import { db } from "@/lib/db";
import { adAccounts } from "@/lib/schema/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return NextResponse.json({ error: "META_SYSTEM_USER_TOKEN not set" }, { status: 500 });

  const client = createMetaClient({ token, graphVersion: process.env.META_GRAPH_VERSION });
  const apiAccounts = await client.getAdAccounts();

  for (const a of apiAccounts) {
    await db
      .insert(adAccounts)
      .values({
        name: a.name,
        metaAccountId: a.id,
        currency: a.currency,
        timezone: a.timezone_name,
        status: a.account_status === 1 ? "active" : "paused",
      })
      .onConflictDoNothing({ target: adAccounts.metaAccountId });
  }

  const all = await db.select().from(adAccounts);
  return NextResponse.json({ accounts: all });
}
