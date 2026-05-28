import { redirect } from "next/navigation";
import { desc, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { syncJobs } from "@/lib/schema/sync";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Último sync Meta (qualquer tipo meta_*) pra status na sidebar
  const [last] = await db
    .select({
      status: syncJobs.status,
      finishedAt: syncJobs.finishedAt,
      createdAt: syncJobs.createdAt,
    })
    .from(syncJobs)
    .where(inArray(syncJobs.type, ["meta_incremental", "meta_full"]))
    .orderBy(desc(syncJobs.createdAt))
    .limit(1);

  const lastSync = last
    ? {
        status: last.status as "done" | "failed" | "running",
        finishedAt: last.finishedAt ?? last.createdAt,
      }
    : null;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar lastSync={lastSync} />
      <div className="flex-1 flex flex-col">
        <Topbar userEmail={user.email ?? ""} />
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
      <Toaster richColors theme="dark" />
    </div>
  );
}
