import Link from "next/link";
import { Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({ children }: { children?: React.ReactNode }) {
  return (
    <Card className="bg-card/40 border-dashed border-border/50">
      <CardContent className="p-10 flex flex-col items-center text-center gap-3">
        <div className="p-3 rounded-full bg-primary/10 text-primary">
          <Database className="h-5 w-5" />
        </div>
        <div className="text-base font-medium">Sem dados de insights ainda</div>
        <p className="text-sm text-muted-foreground max-w-md">
          {children ?? (
            <>
              Os insights do Meta ainda não foram sincronizados pra esse período. Dispara um sync manual em{" "}
              <Link href="/settings/integrations" className="text-primary underline underline-offset-2">
                Configurações
              </Link>{" "}
              ou aguarda o cron diário (02h SP).
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
