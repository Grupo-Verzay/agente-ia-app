import * as React from "react";
import { renderToString } from "react-dom/server";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";

export function pintar(ruta: string, tabs: { url: string; title: string }[], excludePanelRoutes = true): string {
  (globalThis as any).__ruta = ruta;
  return renderToString(<PanelAwareTabNav tabs={tabs} excludePanelRoutes={excludePanelRoutes} />);
}
