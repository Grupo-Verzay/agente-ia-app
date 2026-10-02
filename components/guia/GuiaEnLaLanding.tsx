"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { laGuiaPublicaAction, type GuiaPublica } from "@/actions/guia-publica-actions";
import { CabeceraDeDocumentacion } from "@/components/documentacion/CabeceraDeDocumentacion";
import {
    ArticuloDeLaSeccion,
    CONTENEDOR_DEL_INDICE,
    CuadriculaDeSecciones,
    FinDeLaGuia,
    IntroduccionDeLaGuia,
} from "@/components/guia/Guia";
import type { GuiaDeAyuda } from "@/lib/centro-de-ayuda";

/**
 * UNA GUÍA dentro de la landing (`/inicio#tutoriales/<categoria>/<modulo>`),
 * con la barra de arriba de la landing fija encima. Antes «Ver» sacaba a
 * `/guia/<modulo>`: otra página, con otro diseño y sin la barra de la landing.
 *
 * NO es otra guía: pinta las MISMAS piezas que `/guia/<modulo>`
 * (`components/guia/Guia.tsx`: el vídeo, la introducción, la cuadrícula de
 * secciones y `ArticuloDeLaSeccion`) con el MISMO contenido, que pide al
 * abrirla (`laGuiaPublicaAction`): llevar las diecinueve guías a cuestas en la
 * landing serían cientos de KB que casi nadie abre.
 *
 * - Arriba, la misma cabecera con flecha que la lista de una categoría
 *   (`CabeceraDeDocumentacion`): la flecha vuelve a SU categoría sin navegar.
 * - Las secciones, «Anterior», «Siguiente» y «Volver al índice» cambian de
 *   vista en la misma página (`alAbrir`), y «Ir al vídeo» baja al vídeo sin
 *   tocar el ancla: `#demostracion` pisaría la de los tutoriales.
 * - Las capturas siguen abriendo a tamaño completo en otra pestaña, y
 *   «Contáctanos», en WhatsApp: no son la guía.
 * - La guía es de fondo claro (sus capturas lo son): va en su propio recuadro
 *   dentro de la sección oscura.
 */

/** Lo ya pedido, por módulo: volver a una guía no la vuelve a pedir. */
const pedidas = new Map<string, Promise<GuiaPublica | null>>();

function pedir(modulo: string): Promise<GuiaPublica | null> {
    let p = pedidas.get(modulo);
    if (!p) {
        p = laGuiaPublicaAction(modulo).catch((error) => {
            pedidas.delete(modulo); // un fallo de red se puede reintentar
            throw error;
        });
        pedidas.set(modulo, p);
    }
    return p;
}

type Estado = { modulo: string; guia: GuiaPublica | null; fallo: boolean } | null;

export function GuiaEnLaLanding({
    guia,
    nombreDeLaCategoria,
    seccion,
    alVolver,
    alAbrirSeccion,
}: {
    guia: GuiaDeAyuda;
    nombreDeLaCategoria: string;
    seccion: string | null;
    alVolver: () => void;
    alAbrirSeccion: (slug: string | null) => void;
}) {
    const [estado, setEstado] = useState<Estado>(null);
    const [intento, setIntento] = useState(0);
    const video = useRef<HTMLElement>(null);

    useEffect(() => {
        let vivo = true;
        pedir(guia.modulo)
            .then((g) => {
                if (vivo) setEstado({ modulo: guia.modulo, guia: g, fallo: false });
            })
            .catch((error) => {
                console.warn("[tutoriales] no se pudo cargar la guía en la landing", {
                    modulo: guia.modulo,
                    error: String((error as Error)?.message ?? error).slice(0, 200),
                });
                if (vivo) setEstado({ modulo: guia.modulo, guia: null, fallo: true });
            });
        return () => {
            vivo = false;
        };
    }, [guia.modulo, intento]);

    const cargada = estado?.modulo === guia.modulo ? estado : null;
    const publica = cargada?.guia ?? null;
    const laSeccion = publica && seccion ? publica.secciones.find((s) => s.slug === seccion) ?? null : null;

    return (
        <div className="flex flex-col gap-4" data-guia-en-la-landing={guia.modulo} data-seccion={laSeccion?.slug ?? ""}>
            <CabeceraDeDocumentacion
                titulo={guia.titulo}
                subtitulo={guia.subtitulo}
                volverA={{ alPulsar: alVolver, etiqueta: `Volver a ${nombreDeLaCategoria}` }}
            />

            {!cargada ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" data-guia-cargando>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Cargando la guía…
                </div>
            ) : !publica ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center" data-guia-sin-cargar>
                    <p className="text-base font-medium">
                        {cargada.fallo ? "No se pudo cargar la guía." : "Esta guía ya no está publicada."}
                    </p>
                    {cargada.fallo ? (
                        <button
                            type="button"
                            onClick={() => setIntento((n) => n + 1)}
                            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                            Reintentar
                        </button>
                    ) : null}
                </div>
            ) : (
                <div data-guia className="overflow-hidden rounded-2xl bg-slate-50 text-slate-900">
                    {laSeccion ? (
                        <ArticuloDeLaSeccion
                            carpeta={publica.carpeta}
                            nombre={publica.nombre}
                            secciones={publica.secciones}
                            seccion={laSeccion}
                            alAbrir={alAbrirSeccion}
                        />
                    ) : (
                        <div className={`${CONTENEDOR_DEL_INDICE} pb-6`}>
                            <section ref={video} data-demostracion className="scroll-mt-24" aria-label="Demostración en 1 minuto">
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
                                    <video
                                        data-video-de-la-guia
                                        controls
                                        playsInline
                                        preload="metadata"
                                        poster={publica.portada}
                                        className="block aspect-[16/10] h-auto w-full bg-slate-900"
                                    >
                                        <source src={publica.video} type="video/webm" />
                                        Tu navegador no puede reproducir este vídeo.
                                    </video>
                                </div>
                            </section>

                            <IntroduccionDeLaGuia introduccion={publica.introduccion} />

                            <section className="space-y-4" aria-label="Secciones">
                                <div className="flex items-baseline justify-between gap-3">
                                    <h2 className="text-lg font-semibold text-slate-900">Secciones</h2>
                                    <span className="text-sm text-slate-500">{publica.secciones.length} guías paso a paso</span>
                                </div>
                                <CuadriculaDeSecciones
                                    secciones={publica.secciones}
                                    moduloPath={publica.carpeta}
                                    contactoHref={publica.contactoHref}
                                    videoHref="#demostracion"
                                    alAbrirSeccion={(s) => alAbrirSeccion(s)}
                                    alVerElVideo={() => video.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
                                />
                            </section>

                            <FinDeLaGuia />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
