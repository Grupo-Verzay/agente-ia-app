"use client";

import { useEffect, useState } from "react";
import { Frown, X } from "lucide-react";
import {
    TEXTO_DE_LA_FRANJA,
    laFranjaSeVe,
    type SentimientoDeLaConversacion,
} from "@/lib/sentimiento";

/**
 * La franja de alerta de la conversación abierta: delgada, a lo ancho, pegada
 * encima de la barra de escribir, en rojo suave.
 *
 * - Sale cuando el sentimiento del cliente CAE a negativo.
 * - Se cierra con la equis, y cerrada se queda cerrada para ESA caída
 *   (`negativoDesde` va dentro de la llave): cambiar de chat y volver no la
 *   resucita.
 * - Sin cerrarla, se queda mientras siga negativo y se va SOLA en cuanto mejora
 *   a neutro o positivo. Si vuelve a caer es otra caída —otra fecha— y sale otra
 *   vez.
 *
 * Lo cerrado vive en `sessionStorage` (de esta pestaña), y cada acceso va en su
 * `try`: en una ventana privada tocarlo lanza y la conversación no puede caerse
 * por eso.
 */
const PREFIJO = "chats:franja-cerrada:";

function estaCerrada(llave: string): boolean {
    try {
        return window.sessionStorage.getItem(PREFIJO + llave) === "1";
    } catch {
        return false;
    }
}

function cerrarla(llave: string): void {
    try {
        window.sessionStorage.setItem(PREFIJO + llave, "1");
    } catch {
        // Sin almacenamiento se cierra igual en esta vista.
    }
}

export function FranjaDeSentimiento({
    sentimiento,
    llaveDeLaConversacion,
}: {
    sentimiento: SentimientoDeLaConversacion | null | undefined;
    llaveDeLaConversacion: string;
}) {
    const llave = `${llaveDeLaConversacion}::${sentimiento?.negativoDesde ?? ""}`;
    const [cerrada, setCerrada] = useState(false);

    // Se lee al cambiar de caída o de conversación, y en el navegador: leerlo
    // al pintar daría una salida distinta en el servidor.
    useEffect(() => {
        setCerrada(estaCerrada(llave));
    }, [llave]);

    if (!laFranjaSeVe(sentimiento, cerrada)) return null;

    return (
        <div
            role="status"
            data-franja-de-sentimiento
            className="flex w-full shrink-0 items-center gap-2 border-t border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
        >
            <Frown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{TEXTO_DE_LA_FRANJA}</span>
            <button
                type="button"
                aria-label="Cerrar aviso"
                title="Cerrar aviso"
                onClick={() => {
                    cerrarla(llave);
                    setCerrada(true);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-red-600 transition hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
