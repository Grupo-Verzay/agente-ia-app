// La página pública de una propuesta, la de VERDAD (`PropuestaPublica`), con
// sus planes armados en el navegador: a cada uno se le ponen las funciones con
// la MISMA `lasFuncionesQueSeEnsenan` que usa el servidor.
//
// En el modo bueno se pinta dentro del `<main>` de hoy, que sigue el modo
// claro u oscuro del dispositivo (`data-tema-del-plan="dispositivo"` y
// `bg-plan-fondo`); en el roto, dentro del de antes (`bg-slate-50`, sin tema).
import React from "react";
import { createRoot } from "react-dom/client";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";
import { lasFuncionesQueSeEnsenan } from "@/lib/pagina-de-plan";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

const w = window as any;
const guias = new Map<string, string>(GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]));
const funciones = (lasFuncionesQueSeEnsenan as any)(w.__crudo, w.__datos, guias);
const planes = (w.__planes as any[]).map((p) => ({ ...p, funciones: p.conFunciones ? funciones : [] }));

const pagina = w.__roto ? (
    <main data-pagina-de-la-propuesta className={`bg-slate-50 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
        <PropuestaPublica propuesta={w.__propuesta} planes={planes as any} />
    </main>
) : (
    <main data-pagina-de-la-propuesta data-tema-del-plan="dispositivo" className={`bg-plan-fondo ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
        <PropuestaPublica propuesta={w.__propuesta} planes={planes as any} />
    </main>
);

createRoot(document.getElementById("app")!).render(pagina);
w.listo = true;
