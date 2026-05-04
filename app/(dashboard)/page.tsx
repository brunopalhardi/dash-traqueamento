import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">
        Bem-vindo, {user?.email?.split("@")[0]} 👋
      </h1>
      <p className="text-muted-foreground">
        Conecte sua conta Meta e webhook Hotmart pra começar a ver dados.
      </p>
    </div>
  );
}
