// La página pública de un plan, la de VERDAD, montada como en la App: debajo del
// `ThemeProvider` de next-themes (el de `app/layout.tsx`, con el tema guardado
// en `localStorage`) y dentro del `.dark` fijo del layout público. Así el banco
// ve qué tema toma la guía desplegada según el que tenga la App.
//
// Las funciones se arman en el navegador con las MISMAS `comoFunciones` y
// `lasFuncionesQueSeEnsenan` que usa el servidor.
import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { comoFunciones, lasFuncionesQueSeEnsenan } from "@/lib/pagina-de-plan";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

const w = window as any;
const guias = new Map<string, string>(GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]));
const pagina = { ...w.__pagina, funciones: (lasFuncionesQueSeEnsenan as any)(comoFunciones(w.__crudo), w.__datos, guias) };
w.__funciones = pagina.funciones;

createRoot(document.getElementById("app")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div className="dark bg-slate-900 text-white">
            <PlanDetailPage pagina={pagina} />
        </div>
    </ThemeProvider>,
);
w.listo = true;
