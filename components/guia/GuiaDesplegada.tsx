"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import type { GuiaPublica } from "@/actions/guia-publica-actions";
import { ArticuloDeLaSeccion, CONTENEDOR_DEL_INDICE, CuadriculaDeSecciones, IntroduccionDeLaGuia } from "@/components/guia/Guia";
import { pedirLaGuiaPublica } from "@/components/guia/pedir-la-guia-publica";

/**
 * Una guía paso a paso DESPLEGADA dentro de otra pantalla —hoy, dentro de una
 * función de «Qué incluye este plan» en la página pública de un plan—: nada de
 * lo de aquí saca a nadie de la página ni abre otra pestaña.
 *
 * Es la MISMA guía que `/guia/<modulo>` y que la de la landing: las mismas
 * piezas (`components/guia/Guia.tsx`) y el mismo contenido, pedido al abrirla
 * con la caché compartida (`pedirLaGuiaPublica`). La introducción y la
 * cuadrícula de secciones; pulsar una sección la abre aquí mismo
 * (`ArticuloDeLaSeccion` con `alAbrir`), y «Anterior», «Siguiente» y «Volver
 * al índice» cambian de vista sin navegar.
 *
 * Va en su propio recuadro CLARO (`data-guia-tema="claro"`): sus capturas lo
 * son, y la página del plan es oscura. Lo que sí sale fuera es lo que no es la
 * guía: ampliar una captura y «Contáctanos», igual que en la landing.
 */

type Estado = { modulo: string; guia: GuiaPublica | null; fallo: boolean } | null;

export function GuiaDesplegada({
    modulo,
    id,
    alVerElVideo,
}: {
    modulo: string;
    /** El `id` del recuadro, para el `aria-controls` del botón que la abre. */
    id?: string;
    /** «Ir al vídeo» baja al video de la función, sin tocar el ancla. */
    alVerElVideo?: () => void;
}) {
    const [estado, setEstado] = useState<Estado>(null);
    const [intento, setIntento] = useState(0);
    const [seccion, setSeccion] = useState<string | null>(null);
    const caja = useRef<HTMLDivElement>(null);
    const seccionVista = useRef<string | null>(null);

    useEffect(() => {
        let vivo = true;
        pedirLaGuiaPublica(modulo)
            .then((g) => {
                if (vivo) setEstado({ modulo, guia: g, fallo: false });
            })
            .catch((error) => {
                console.warn("[planes] no se pudo cargar la guía dentro de la función", {
                    modulo,
                    error: String((error as Error)?.message ?? error).slice(0, 200),
                });
                if (vivo) setEstado({ modulo, guia: null, fallo: true });
            });
        return () => {
            vivo = false;
        };
    }, [modulo, intento]);

    // Al cambiar de sección (o volver al índice) la vista empieza arriba de la
    // guía: sin esto se queda donde estaba el botón pulsado, abajo del todo.
    // La primera vista no se mueve: la abrió quien está mirando ese sitio.
    useEffect(() => {
        if (seccionVista.current === seccion) return;
        seccionVista.current = seccion;
        caja.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, [seccion]);

    const cargada = estado?.modulo === modulo ? estado : null;
    const publica = cargada?.guia ?? null;
    const laSeccion = publica && seccion ? publica.secciones.find((s) => s.slug === seccion) ?? null : null;

    return (
        <div ref={caja} id={id} className="scroll-mt-20" data-guia-desplegada={modulo} data-seccion-abierta={laSeccion?.slug ?? ""}>
            {!cargada ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] py-10 text-sm text-slate-400" data-guia-cargando>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Cargando la guía…
                </div>
            ) : !publica ? (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-white/[0.03] py-10 text-center" data-guia-sin-cargar>
                    <p className="text-sm font-medium text-white">
                        {cargada.fallo ? "No se pudo cargar la guía." : "Esta guía ya no está publicada."}
                    </p>
                    {cargada.fallo ? (
                        <button
                            type="button"
                            onClick={() => setIntento((n) => n + 1)}
                            className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                        >
                            Reintentar
                        </button>
                    ) : null}
                </div>
            ) : (
                <div data-guia data-guia-tema="claro" className="overflow-hidden rounded-xl bg-guia-fondo text-guia-texto">
                    {laSeccion ? (
                        <ArticuloDeLaSeccion
                            carpeta={publica.carpeta}
                            nombre={publica.nombre}
                            secciones={publica.secciones}
                            seccion={laSeccion}
                            alAbrir={setSeccion}
                        />
                    ) : (
                        <div className={`${CONTENEDOR_DEL_INDICE} pb-6`}>
                            <IntroduccionDeLaGuia introduccion={publica.introduccion} />
                            <section className="space-y-4" aria-label="Secciones">
                                <div className="flex items-baseline justify-between gap-3">
                                    <h2 className="text-lg font-semibold text-guia-texto">Secciones</h2>
                                    <span className="text-sm text-guia-suave">{publica.secciones.length} guías paso a paso</span>
                                </div>
                                <CuadriculaDeSecciones
                                    secciones={publica.secciones}
                                    moduloPath={publica.carpeta}
                                    contactoHref={publica.contactoHref}
                                    videoHref="#"
                                    alAbrirSeccion={setSeccion}
                                    alVerElVideo={alVerElVideo ?? (() => caja.current?.scrollIntoView({ block: "start", behavior: "smooth" }))}
                                />
                            </section>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
