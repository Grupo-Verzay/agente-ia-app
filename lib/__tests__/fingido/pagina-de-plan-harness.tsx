// La página pública de un plan, la de VERDAD, con lo que arma el servidor
// metido en `window.__pagina` por el banco.
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";

createRoot(document.getElementById("app")!).render(<PlanDetailPage pagina={(window as any).__pagina} />);
(window as any).listo = true;
