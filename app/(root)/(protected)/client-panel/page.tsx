import { PanelHome } from "@/app/(root)/(protected)/panel/_components/PanelHome";
import AccessDenied from "@/app/AccessDenied";
import { getClientPanelTabs } from "@/lib/client-panel-tabs";
import { getClientPanelModules } from "./_lib/getClientPanelModules";

export default async function ClientPanelPage() {
  const { user, modules } = await getClientPanelModules();
  if (!user) return <AccessDenied />;

  const sections = getClientPanelTabs(modules);
  const clientName = user.company?.trim() || user.name?.trim() || "Cliente";

  return <PanelHome sections={sections} adminName={clientName} />;
}
