import { TokenStatus } from "./_components/token-status";
import { AccountsTable } from "./_components/accounts-table";
import { LastSync } from "./_components/last-sync";
import { RefreshNowButton } from "./_components/refresh-now-button";
import { TokenHowto } from "./_components/token-howto";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrações</h1>
        <p className="text-sm text-muted-foreground">Conecte o Meta Ads para sincronizar campanhas e métricas.</p>
      </div>
      <TokenStatus />
      <AccountsTable />
      <LastSync />
      <RefreshNowButton />
      <TokenHowto />
    </div>
  );
}
