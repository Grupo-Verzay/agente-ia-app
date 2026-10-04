// La página pública de un plan, la de VERDAD, montada como la sirve la App:
// debajo del `ThemeProvider` de next-themes y dentro del contenedor del layout
// público, que es el que SE DESPLAZA (`PANTALLA_PUBLICA_QUE_SE_DESPLAZA`): el
// `<body>` de la App va con `overflow-hidden`, así que la ventana no se mueve.
// Medir los saltos contra la ventana sería medir algo que en la App no existe.
//
// Las funciones se arman en el navegador con las MISMAS `comoFunciones` y
// `lasFuncionesQueSeEnsenan` que usa el servidor.
import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { PlanDetailPage } from "@/app/(public)/planes/[slug]/_components/PlanDetailPage";
import { comoFunciones, lasFuncionesQueSeEnsenan } from "@/lib/pagina-de-plan";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

const w = window as any;
const guias = new Map<string, string>(GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]));
const pagina = { ...w.__pagina, funciones: (lasFuncionesQueSeEnsenan as any)(comoFunciones(w.__crudo), w.__datos, guias) };
w.__funciones = pagina.funciones;

createRoot(document.getElementById("app")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div className={`dark bg-slate-900 text-white ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`} data-pantalla-publica>
            <PlanDetailPage pagina={pagina} />
        </div>
    </ThemeProvider>,
);
w.listo = true;
