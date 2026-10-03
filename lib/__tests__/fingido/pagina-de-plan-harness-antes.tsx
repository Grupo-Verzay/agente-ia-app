// @ts-nocheck — se compila contra el árbol de ANTES (ver scripts/banco-pagina-de-plan.sh); en este árbol el componente ya recibe `pagina`, a propósito.
// La página de un plan de ANTES (`ANTES_REF`), con lo que le pasaba su `page.tsx`.
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";

const w = window as any;
createRoot(document.getElementById("app")!).render(<PlanDetailPage plan={w.__plan} detail={w.__detalle} planLabel={w.__etiqueta} />);
w.listo = true;
