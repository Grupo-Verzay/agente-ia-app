// «Todo incluido, sin sorpresas» en sus tres sitios, con los componentes de
// VERDAD: la página pública del plan (`window.__pagina`), el plan dentro de una
// propuesta (`window.__planDeLaPropuesta`, con el tema del dispositivo) o la
// pestaña «Página de detalle» del panel (acciones de mentira).
import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { PlanEnLaPropuesta } from "@/components/propuestas/PlanEnLaPropuesta";
import { PlanDetailTab } from "@/app/(root)/(protected)/admin/planes/_components/PlanDetailTab";
import { lasFuncionesQueSeEnsenan, losDatosDelPlan } from "@/lib/pagina-de-plan";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { pedidas } from "@/lib/__tests__/fingido/acciones-del-todo-incluido";

const w = window as any;
w.pedidas = pedidas;

let raiz: React.ReactNode;
if (w.__que === "propuesta") {
    raiz = (
        <main data-pagina-de-la-propuesta data-tema-del-plan="dispositivo" className={`bg-plan-fondo p-4 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            <PlanEnLaPropuesta plan={w.__planDeLaPropuesta} />
        </main>
    );
} else if (w.__que === "panel") {
    const datos = losDatosDelPlan({ plan: "intermedio", name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA" } as any, ["Starter"]);
    raiz = (
        <div className="mx-auto max-w-2xl p-4">
            <PlanDetailTab
                subscriptionPlanId="plan-banco"
                datos={datos}
                enlaceDeLaPagina="/planes/nivel-3"
                planActivo
                funcionesQueSalen={lasFuncionesQueSeEnsenan([], datos, new Map())}
            />
            <Toaster />
        </div>
    );
} else {
    raiz = <PlanDetailPage pagina={w.__pagina} />;
}

createRoot(document.getElementById("app")!).render(raiz);
w.listo = true;
