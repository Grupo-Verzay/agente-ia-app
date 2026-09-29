import type { Metadata } from "next";
import { PlayCircle } from "lucide-react";

import { CabeceraDeLaGuia, TarjetaDeSeccion } from "@/components/guia/Guia";
import { GUIA_LEADS, PORTADA_DEL_VIDEO, SECCIONES, VIDEO_DE_DEMOSTRACION } from "@/lib/guia-leads";

/**
 * El índice de la guía de Leads: qué es el módulo, la demostración en vídeo y
 * una tarjeta por sección. Pública y no indexada (ver `app/guia/layout.tsx`).
 */
export const metadata: Metadata = { title: "Leads" };

export default function IndiceDeLaGuiaDeLeads() {
    return (
        <>
            <CabeceraDeLaGuia />
            <div className="mx-auto w-full max-w-5xl space-y-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
                <section className="space-y-3">
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Guía del módulo</p>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{GUIA_LEADS.titulo}</h1>
                    <p className="text-lg font-medium text-slate-700">{GUIA_LEADS.subtitulo}</p>
                    <p className="max-w-3xl text-base leading-relaxed text-slate-600">{GUIA_LEADS.descripcion}</p>
                </section>

                <section className="space-y-3" aria-labelledby="demostracion">
                    <h2 id="demostracion" className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <PlayCircle className="h-5 w-5 text-blue-600" aria-hidden />
                        Demostración en 1 minuto
                    </h2>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
                        <video
                            data-video-de-la-guia
                            controls
                            playsInline
                            preload="metadata"
                            poster={PORTADA_DEL_VIDEO}
                            className="block aspect-[16/10] h-auto w-full bg-slate-900"
                        >
                            <source src={VIDEO_DE_DEMOSTRACION} type="video/webm" />
                            Tu navegador no puede reproducir este vídeo.
                        </video>
                    </div>
                </section>

                <section className="space-y-4" aria-labelledby="secciones">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 id="secciones" className="text-lg font-semibold text-slate-900">
                            Secciones
                        </h2>
                        <span className="text-sm text-slate-500">{SECCIONES.length} guías paso a paso</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {SECCIONES.map((s, i) => (
                            <TarjetaDeSeccion key={s.slug} seccion={s} numero={i + 1} />
                        ))}
                    </div>
                </section>

                <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
                    Las capturas se toman automáticamente de la plataforma real, con datos de ejemplo.
                </footer>
            </div>
        </>
    );
}
