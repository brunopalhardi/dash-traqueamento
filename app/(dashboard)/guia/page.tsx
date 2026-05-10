import { PerpetuoDashboard } from "../_perpetuo-template";

export const dynamic = "force-dynamic";

export default function GuiaPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  return <PerpetuoDashboard slug="guia" searchParams={searchParams} />;
}
