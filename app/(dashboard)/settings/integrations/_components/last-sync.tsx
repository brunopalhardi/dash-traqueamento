import { db } from "@/lib/db";
import { syncJobs } from "@/lib/schema/sync";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function LastSync() {
  const [last] = await db
    .select()
    .from(syncJobs)
    .orderBy(desc(syncJobs.createdAt))
    .limit(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Última sincronização</CardTitle>
      </CardHeader>
      <CardContent>
        {!last ? (
          <p className="text-sm text-muted-foreground">Ainda não sincronizado.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={last.status === "done" ? "default" : "destructive"}>
                {last.status}
              </Badge>
              <span className="text-muted-foreground">
                {last.finishedAt ? new Date(last.finishedAt).toLocaleString("pt-BR") : "em andamento…"}
              </span>
            </div>
            <p className="text-muted-foreground">
              {last.rowsProcessed ?? 0} linhas processadas
              {last.errorMessage ? ` — ${last.errorMessage}` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
