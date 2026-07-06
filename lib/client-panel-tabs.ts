import type { ModuleWithItems } from "@/schema/module";

export type ClientPanelTab = {
  url: string;
  title: string;
};

function normalizePanelUrl(url?: string | null) {
  return (url ?? "").replace("/admin/", "/panel/");
}

export function getClientPanelTabs(modules: ModuleWithItems[]): ClientPanelTab[] {
  const clientPanelModule = modules.find((module) => module.route === "/client-panel");

  return (clientPanelModule?.moduleItems ?? [])
    .map((item) => ({
      url: normalizePanelUrl(item.url),
      title: item.title,
    }))
    .filter((tab) => Boolean(tab.url));
}
