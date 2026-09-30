// Pinta otra web dentro de la plataforma: el Copiloto, Canva, las pestañas de
// integración de Chats, las herramientas y Evo.
'use client';

import { sePuedeIncrustar } from '@/lib/integraciones';

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

    // La red de abajo: lo que no es una dirección web (`javascript:`, `data:`…)
    // no se pinta. El React de Next 14 no lo bloquea —solo lo avisa— y aquí
    // llegan direcciones de la URL de la página (`/canva?u=`, `/copiloto?u=`)
    // y de lo que guardó una cuenta (las apps de Integrar URLs). Se dice por
    // qué, porque un recuadro en blanco se lee como una app caída.
    if (!sePuedeIncrustar(url)) {
        console.warn('[iframe] se descarta una dirección que no es web', { url: url.slice(0, 80) });
        return (
            <div
                className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
                data-marco-rechazado
            >
                Esta dirección no se puede abrir aquí: solo se abren direcciones web (https://).
            </div>
        );
    }

    return (
        <iframe
            src={url}
            title={title}
            className="block w-full h-full border-0"
            allow="microphone; screen-wake-lock; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
        />
    );
}
