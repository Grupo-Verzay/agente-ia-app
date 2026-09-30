import { CalendarCheck, MessageCircle } from "lucide-react";

import {
    CAPACIDADES_DEL_VIDEO,
    DURACION_DEL_VIDEO_DE_VENTAS,
    LLAMADO_DEL_VIDEO,
    LO_QUE_ES_EL_VIDEO,
    MENSAJE_PARA_VERZAY,
    PORTADA_DEL_VIDEO_DE_VENTAS,
    VIDEO_DE_VENTAS,
    elEnlaceDeWhatsapp,
    losNegociosEnUnaFrase,
} from "@/lib/video-de-ventas";

/**
 * La página del vídeo de ventas: el vídeo, lo que enseña y cómo seguir.
 *
 * Todo en una columna del mismo ancho (`max-w-5xl`, el de las guías) y todo
 * simétrico: las ocho capacidades son dos filas de cuatro —cuatro de dos en un
 * teléfono— y los dos llamados miden lo mismo. Sin nada que cargue de la base:
 * se sirve igual con dos réplicas y sin sesión.
 */
const CONTENEDOR = "mx-auto w-full max-w-5xl px-4 sm:px-6";

export default function PaginaDelVideoDeVentas() {
    const whatsapp = elEnlaceDeWhatsapp(LLAMADO_DEL_VIDEO.whatsapp, MENSAJE_PARA_VERZAY);
    return (
        <>
            <header data-cabecera-de-la-demo className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
                <div className={`${CONTENEDOR} flex h-14 items-center justify-between gap-3`}>
                    <span className="inline-flex min-w-0 items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
                        <span className="truncate text-sm font-semibold text-slate-900">Verzay</span>
                    </span>
                    <a
                        href={LLAMADO_DEL_VIDEO.agendar}
                        data-llamado="cabecera"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        <CalendarCheck className="h-4 w-4" aria-hidden />
                        <span className="hidden sm:inline">Agendar una reunión</span>
                        <span className="sm:hidden">Agendar</span>
                    </a>
                </div>
            </header>

            <div className={`${CONTENEDOR} space-y-10 py-6 sm:py-10`}>
                <section className="space-y-2 text-center" aria-labelledby="titulo">
                    <h1 id="titulo" className="text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                        Mira a Verzay atendiendo a un cliente de principio a fin
                    </h1>
                    <p className="mx-auto max-w-2xl text-balance text-sm text-slate-600 sm:text-base">
                        {DURACION_DEL_VIDEO_DE_VENTAS}, en tres pantallas a la vez: el celular del negocio, WhatsApp Web y el panel de Verzay.
                    </p>
                </section>

                <section data-video-de-ventas aria-label="Vídeo de la demostración" className="space-y-2">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
                        <video
                            controls
                            playsInline
                            preload="metadata"
                            poster={PORTADA_DEL_VIDEO_DE_VENTAS}
                            className="block aspect-video h-auto w-full bg-slate-900"
                        >
                            <source src={VIDEO_DE_VENTAS} type="video/mp4" />
                            Tu navegador no puede reproducir este vídeo.
                        </video>
                    </div>
                    <p data-lo-que-es className="text-center text-xs text-slate-500">
                        {LO_QUE_ES_EL_VIDEO}
                    </p>
                </section>

                <section className="space-y-4" aria-labelledby="capacidades">
                    <h2 id="capacidades" className="text-center text-lg font-semibold text-slate-900">
                        Lo que acabas de ver
                    </h2>
                    <ol data-capacidades className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {CAPACIDADES_DEL_VIDEO.map((c, i) => (
                            <li key={c.escena} data-capacidad={c.escena} className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                                    {i + 1}
                                </span>
                                <span className="text-sm font-semibold leading-snug text-slate-900">{c.titulo}</span>
                                <span className="text-xs text-slate-500">{c.detalle}</span>
                            </li>
                        ))}
                    </ol>
                </section>

                <section data-llamados className="rounded-2xl border border-slate-200 bg-white p-5 text-center sm:p-8" aria-labelledby="llamado">
                    <h2 id="llamado" className="text-balance text-xl font-bold text-slate-900 sm:text-2xl">
                        ¿Lo quieres funcionando en tu negocio?
                    </h2>
                    <p className="mx-auto mt-2 max-w-xl text-balance text-sm text-slate-600">
                        En una reunión corta te lo enseñamos con tus propios casos: {losNegociosEnUnaFrase()}.
                    </p>
                    <div className="mx-auto mt-5 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
                        <a
                            href={LLAMADO_DEL_VIDEO.agendar}
                            data-llamado="agendar"
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            <CalendarCheck className="h-4 w-4" aria-hidden />
                            Agendar una reunión
                        </a>
                        <a
                            href={whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-llamado="whatsapp"
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-emerald-600 bg-white px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                            <MessageCircle className="h-4 w-4" aria-hidden />
                            Escribir por WhatsApp
                        </a>
                    </div>
                </section>

                <hr data-fin-de-la-demo className="border-0 border-t border-slate-200" />
            </div>
        </>
    );
}
