/**
 * Arnés del centro de ayuda: las pantallas de VERDAD (`CentroDeAyuda` y
 * `GuiasDeLaCategoria`) y, para comparar, la fila de Documentación › Guías
 * (`EditarIntroduccionDeLaGuia`), dentro de una caja con la forma de la del
 * layout. Las guías las pone el banco (`window.__guias`), sacadas en Node de
 * `lasGuiasDelCentroDeAyuda()`: las mismas que pinta la App.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { CentroDeAyuda } from "@/components/ayuda/CentroDeAyuda";
import { GuiasDeLaCategoria } from "@/components/ayuda/GuiasDeLaCategoria";
import { EditarIntroduccionDeLaGuia } from "@/app/(root)/documentation/guide/_components/EditarIntroduccionDeLaGuia";
import { laCategoria, lasGuiasDeLaCategoria } from "@/lib/centro-de-ayuda";

const w = window as any;

function pintar(hijo: React.ReactNode) {
    const nodo = document.getElementById("app")!;
    const raiz = (w.__raiz ??= createRoot(nodo));
    raiz.render(
        <div data-contenido-de-la-app className="flex h-screen min-h-0 flex-col p-0 sm:p-1">
            <div data-caja-del-contenido className="flex min-h-0 flex-1 flex-col sm:rounded-md sm:border sm:border-border/70">
                {hijo}
            </div>
        </div>,
    );
}

w.pintarCentro = () => pintar(<CentroDeAyuda guias={w.__guias} />);
w.pintarCategoria = (slug: string) => {
    const c = laCategoria(slug)!;
    pintar(<GuiasDeLaCategoria categoria={c} guias={lasGuiasDeLaCategoria(w.__guias, slug)} />);
};
// La fila de Documentación › Guías, en una lista como la de allí (`grid gap-2`).
w.pintarFilaDeDocumentacion = () =>
    pintar(
        <div className="grid gap-2 p-4">
            <EditarIntroduccionDeLaGuia modulo="leads" nombre="Leads" />
        </div>,
    );
w.listo = true;
