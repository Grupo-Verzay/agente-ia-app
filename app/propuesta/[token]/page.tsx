import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { laPropuestaPublica } from "@/lib/propuestas-db";
import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";

/**
 * La página pública de una PROPUESTA COMERCIAL, abierta por su enlace.
 *
 * **Pública a propósito** —está en el middleware— porque se la manda la cuenta
 * a su cliente por WhatsApp, y ese cliente no tiene cuenta en la plataforma.
 * Y ser pública no la abre: el token (192 bits, generado por el servidor) es
 * la única puerta, y lo que se enseña se elige campo por campo en
 * `laPropuestaPublica`.
 *
 * **No se indexa**: `robots` aquí y `X-Robots-Tag` en la cabecera
 * (`next.config.js`). Una propuesta lleva precios de un cliente concreto.
 *
 * Mobile-first: la inmensa mayoría la abre desde WhatsApp en el teléfono. Vive
 * fuera de `(root)`, como `/t/` y `/reunion`, así que lleva su propio
 * contenedor que se desplaza (`PANTALLA_PUBLICA_QUE_SE_DESPLAZA`).
 *
 * Y la metadata es fija a propósito: con `generateMetadata` se leería la
 * propuesta dos veces —y se contaría dos veces la visita— y el nombre del
 * cliente saldría en la vista previa del enlace.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Propuesta comercial",
    robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
    },
};

export default async function PaginaDePropuesta({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const propuesta = await laPropuestaPublica(token).catch((error) => {
        console.error("[propuestas] no se pudo abrir la página pública", { error: String(error) });
        return null;
    });

    if (!propuesta) {
        return (
            <main className={`flex items-center justify-center bg-slate-50 px-4 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
                <div className="w-full max-w-sm space-y-3 rounded-2xl border bg-white p-6 text-center shadow-sm">
                    <FileText className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="text-base font-semibold text-slate-900">Esta propuesta no está disponible</p>
                    {/* No se dice si existió ni de quién era: quien tiene el
                        enlace puede ser cualquiera. */}
                    <p className="text-sm text-slate-500">Pídele a quien te la envió un enlace nuevo.</p>
                </div>
            </main>
        );
    }

    return (
        <main className={`bg-slate-50 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            <PropuestaPublica propuesta={propuesta} />
        </main>
    );
}
