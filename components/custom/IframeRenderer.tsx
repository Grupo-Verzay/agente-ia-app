// app/iframe/IframeRenderer.tsx
'use client';

import { sePuedeIncrustar } from '@/lib/integraciones';

interface Props {
    url: string | null;
}

export default function IframeRenderer({ url }: Props) {
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
            <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Esta dirección no se puede abrir aquí: solo se abren direcciones web (https://).
            </div>
        );
    }

    return (
        <iframe
            src={url}
            title="Tool 2"
            className="block w-full h-full border-0"
            allow="microphone; screen-wake-lock; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
        />
    );
}
