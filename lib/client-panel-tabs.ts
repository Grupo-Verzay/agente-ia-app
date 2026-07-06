import type { ModuleWithItems } from "@/schema/module";
import { resolveModuleItemDest } from "@/lib/canva-embed";

export type ClientPanelTab = {
  url: string;
  title: string;
};

export function getClientPanelTabs(modules: ModuleWithItems[]): ClientPanelTab[] {
  const clientPanelModule = modules.find((module) => module.route === "/client-panel");

  return (clientPanelModule?.moduleItems ?? [])
    .map((item) => ({
      url: resolveModuleItemDest(item.url, item.customUrl),
      title: item.title,
    }))
    .filter((tab) => Boolean(tab.url));
}
