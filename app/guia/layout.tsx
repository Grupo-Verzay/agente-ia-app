import type { Metadata } from "next";

import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

/**
 * La DOCUMENTACIÓN PÚBLICA de la plataforma (`/guia/...`), con el mismo
 * sistema que la página pública de una Propuesta comercial:
 *
 * - **Pública a propósito**: está en el middleware, porque se le pasa a un
 *   cliente que todavía no tiene cuenta o a alguien del equipo que no ha
 *   entrado. No lee nada de la base salvo el texto editable del índice: el
 *   contenido sale de `lib/guia-<modulo>.ts` (Leads, Catálogo, Diagramas).
 * - **No se indexa**: `robots` aquí y `X-Robots-Tag` en la cabecera
 *   (`next.config.js`). Es una prueba piloto y enseña capturas de la App.
 * - Vive fuera de `(root)`, así que lleva su propio contenedor que se desplaza
 *   (`PANTALLA_PUBLICA_QUE_SE_DESPLAZA`): el `<body>` de la App va con
 *   `overflow-hidden` y sin esto la guía nacería sin poder bajar.
 */
export const metadata: Metadata = {
    title: { default: "Guía de la plataforma", template: "%s · Guía de la plataforma" },
    robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
    },
};

export default function LayoutDeLaGuia({ children }: { children: React.ReactNode }) {
    return (
        <main data-guia className={`bg-slate-50 text-slate-900 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            {children}
        </main>
    );
}
