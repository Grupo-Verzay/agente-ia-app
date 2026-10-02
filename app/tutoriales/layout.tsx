import type { Metadata } from "next";
import Link from "next/link";
import { Bot } from "lucide-react";

import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

/**
 * Los TUTORIALES públicos (`/tutoriales`): la entrada «Tutoriales» del menú de
 * la landing, para quien todavía no tiene cuenta.
 *
 * NO es una copia del centro de ayuda: pinta los mismos componentes
 * (`CentroDeAyuda`, `GuiasDeLaCategoria`) con las mismas guías
 * (`lasGuiasDelCentroDeAyuda`, que sale de `GUIAS_PUBLICADAS`), así que una
 * guía que se publica sale aquí y en `/ayuda` a la vez. Lo único propio es
 * este marco —sin el menú de la plataforma— y la raíz de los enlaces.
 *
 * - **Pública**: está en el middleware. No lee nada de la base.
 * - **No se indexa**, igual que las guías a las que lleva (`/guia/...`).
 * - Vive fuera de `(root)`, así que lleva su propio contenedor que se desplaza.
 *   El centro de ayuda se desplaza por dentro (`h-full`), y por eso la caja
 *   del contenido es una columna con alto acotado.
 */
export const metadata: Metadata = {
    title: { default: "Tutoriales", template: "%s · Tutoriales" },
    description: "Guías paso a paso de la plataforma, con su vídeo.",
    robots: {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
    },
};

export default function LayoutDeTutoriales({ children }: { children: React.ReactNode }) {
    return (
        <main data-tutoriales-publicos className={`flex flex-col bg-slate-50 text-slate-900 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            <header className="shrink-0 border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
                    <Link href="/" className="flex items-center gap-2" aria-label="Volver al inicio">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                            <Bot className="h-4 w-4 text-white" aria-hidden />
                        </span>
                        <span className="text-lg font-bold">Agente IA</span>
                    </Link>
                    <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        Iniciar sesión
                    </Link>
                </div>
            </header>
            <div className="mx-auto min-h-0 w-full max-w-5xl flex-1">{children}</div>
        </main>
    );
}
