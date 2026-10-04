"use client";

import { useState } from "react";
import { Play } from "lucide-react";

import { conReproduccionAutomatica, type VideoDelPlan as Video } from "@/lib/pagina-de-plan";

/** El video principal de un plan, como lo pinta su página pública. */
export type VideoPrincipalDelPlan = Video & { titulo: string; miniatura: string | null };

/**
 * El reproductor del video principal de un plan. Es UNO: lo pintan la página
 * pública del plan (`/planes/<plan>`) y la página pública de una propuesta que
 * lo lleva. Con dos copias, el día que se afine uno el otro se queda atrás.
 *
 * - Un archivo subido se pinta con `<video>` y su portada.
 * - Un reproductor web (YouTube, Vimeo, Loom, Drive) con miniatura sale primero
 *   como la imagen con el botón de reproducir, y el `<iframe>` se monta al
 *   pulsarla —con reproducción automática—: un iframe de YouTube son ~1 MB que
 *   no hay por qué bajar si nadie lo pulsa. Sin miniatura, el iframe directo.
 */
export function VideoDelPlan({ video }: { video: VideoPrincipalDelPlan }) {
    const [reproduciendo, setReproduciendo] = useState(false);

    if (video.tipo === "archivo") {
        return (
            <div className="overflow-hidden rounded-lg bg-black" data-video="archivo">
                <video
                    src={video.url}
                    poster={video.miniatura ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full"
                    aria-label={video.titulo}
                />
            </div>
        );
    }

    if (reproduciendo || !video.miniatura) {
        return (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black" data-video="iframe">
                <iframe
                    src={reproduciendo ? conReproduccionAutomatica(video.url) : video.url}
                    title={video.titulo}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="h-full w-full"
                />
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setReproduciendo(true)}
            className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-black text-left"
            aria-label={`Reproducir: ${video.titulo}`}
            data-video="miniatura"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.miniatura} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/50">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl">
                    <Play className="h-6 w-6 fill-slate-900 text-slate-900" />
                </span>
            </span>
        </button>
    );
}
