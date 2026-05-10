import { PerpetuoDashboard } from "../_perpetuo-template";

export const dynamic = "force-dynamic";

export default function SonoPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  return <PerpetuoDashboard slug="sono" searchParams={searchParams} />;
}
