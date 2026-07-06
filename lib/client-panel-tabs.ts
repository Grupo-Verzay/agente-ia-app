import type { ModuleWithItems } from "@/schema/module";

export type ClientPanelTab = {
  url: string;
  title: string;
};

const PANEL_CONTAINER_ROUTES = new Set(["/admin", "/panel", "/reseller-panel", "/client-panel"]);

function normalizePanelUrl(url?: string | null) {
  return (url ?? "").replace("/admin/", "/panel/");
}

function getModuleDestination(module: ModuleWithItems) {
  if (module.route === "/canva" && module.customUrl) return module.customUrl;
  if (module.isContainer && module.moduleItems?.length) {
    return normalizePanelUrl(module.moduleItems[0]?.url);
  }
  return normalizePanelUrl(module.route);
}

export function getClientPanelTabs(modules: ModuleWithItems[]): ClientPanelTab[] {
  return modules
    .filter((module) => !PANEL_CONTAINER_ROUTES.has(module.route))
    .map((module) => ({
      url: getModuleDestination(module),
      title: module.label,
    }))
    .filter((tab) => Boolean(tab.url));
}
