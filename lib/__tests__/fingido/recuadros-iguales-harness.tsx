// Los recuadros de capacidad en las DOS vistas que los pintan: la página
// pública del plan (la landing) y la propuesta que lleva ese plan dentro.
// `window.__vista` dice cuál se monta; ambas son los componentes de VERDAD.
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

const w = window as any;

const vista =
    w.__vista === "plan" ? (
        <PlanDetailPage pagina={w.__pagina} />
    ) : (
        <main data-pagina-de-la-propuesta data-tema-del-plan="dispositivo" className={`bg-plan-fondo ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            <PropuestaPublica propuesta={w.__propuesta} planes={w.__planes as any} />
        </main>
    );

createRoot(document.getElementById("app")!).render(vista);
w.listo = true;
