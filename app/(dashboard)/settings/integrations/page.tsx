import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenStatus } from "./_components/token-status";
import { AccountsTable } from "./_components/accounts-table";
import { LastSync } from "./_components/last-sync";
import { RefreshNowButton } from "./_components/refresh-now-button";
import { TokenHowto } from "./_components/token-howto";
import { VturbMapping } from "./_components/vturb-mapping";
import { getUnmappedActivePages, listVturbPlayers } from "@/lib/queries/vturb";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const [unmapped, vplayers] = await Promise.all([
    getUnmappedActivePages("guia"),
    listVturbPlayers(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="configurações · integrações"
        title="Integrações"
        subtitle="Conecte o Meta Ads para sincronizar campanhas e métricas"
        hidePicker
      />
      <div className="max-w-4xl space-y-6">
        <TokenStatus />
        <AccountsTable />
        <LastSync />
        <RefreshNowButton />
        <TokenHowto />
        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              VTurb · páginas sem player
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VturbMapping pages={unmapped} players={vplayers} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
