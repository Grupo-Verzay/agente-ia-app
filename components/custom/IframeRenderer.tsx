// Pinta otra web dentro de la plataforma: el Copiloto, Canva, las pestañas de
// integración de Chats, las herramientas y Evo.
'use client';

import { laUrlQueSePuedeAbrir, MOTIVO_URL_NO_VALIDA } from "@/lib/url-embebible";

interface Props {
    url: string | null;
    /**
     * Cómo se llama lo que va dentro, para un lector de pantalla. Sin él, un
     * marco se anuncia con un nombre que no dice nada.
     */
    title?: string;
}

export default function IframeRenderer({ url, title = "Herramienta integrada" }: Props) {
    if (!url) {
        return <div className="text-red-500">Error al cargar el iframe.</div>;
    }

    // La dirección llega de un enlace (`?u=`) o de algo guardado por alguien:
    // un `src` con `javascript:` correría en la plataforma, con la sesión de
    // quien mira. Solo se pinta lo que es `http(s)` o relativo (ver
    // `lib/url-embebible.ts`); lo demás se dice en vez de pintarse.
    const segura = laUrlQueSePuedeAbrir(url);
    if (!segura) {
        return (
            <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground" data-marco-rechazado>
                No se puede abrir esta dirección. {MOTIVO_URL_NO_VALIDA}
            </div>
        );
    }

    return (
        <iframe
            src={segura}
            title={title}
            className="block w-full h-full border-0"
            allow="microphone; screen-wake-lock; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
        />
    );
}
