import AccessDenied from "@/app/AccessDenied";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import { getClientPanelTabs } from "@/lib/client-panel-tabs";
import { getClientPanelModules } from "./_lib/getClientPanelModules";

export default async function ClientPanelLayout({ children }: { children: React.ReactNode }) {
  const { user, modules } = await getClientPanelModules();
  if (!user) return <AccessDenied />;

  const tabs = getClientPanelTabs(modules);

  return (
    <div className="flex h-full min-w-0 w-full flex-col">
      <PanelAwareTabNav tabs={tabs} panelRoutes={["/client-panel"]} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
