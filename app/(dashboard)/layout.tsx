import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar userEmail={user.email ?? ""} />
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
      <Toaster richColors theme="dark" />
    </div>
  );
}
