import type { Metadata } from "next";

import {
    CabeceraDeLaGuia,
    CONTENEDOR_DEL_INDICE,
    CuadriculaDeSecciones,
    FinDeLaGuia,
    IntroduccionDeLaGuia,
} from "@/components/guia/Guia";
import { CARPETA_DE_CAPTURAS, GUIA_FLUJOS, PORTADA_DEL_VIDEO, SECCIONES, VIDEO_DE_DEMOSTRACION } from "@/lib/guia-flujos";
import { laIntroduccionPublica } from "@/lib/introduccion-publica.server";
import { elContactoDeLaGuia } from "@/lib/contacto-de-la-guia.server";

/**
 * El índice de la guía de Crear flujos —el mismo que el de Leads, con las mismas
 * piezas—, en este orden: la demostración en vídeo, la
 * introducción (editable desde Documentación › Administrador guías) y una
 * tarjeta por sección, con las tarjetas de cierre que dejan la cuadrícula
 * simétrica (`lib/cierre-de-la-guia.ts`). Pública y no indexada (ver
 * `app/guia/layout.tsx`).
 *
 * Dinámica a propósito: la introducción se edita y con dos réplicas un caché
 * de página se quedaría viejo en una de ellas. Es una consulta por una clave
 * primaria, y sin base sale el texto del código.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Crear flujos" };

/** Lo que dice la barra de arriba sobre el vídeo que va justo debajo. */
const DEMOSTRACION = "Demostración en 1 minuto";

export default async function IndiceDeLaGuiaDeFlujos() {
    const [introduccion, contactoHref] = await Promise.all([
        laIntroduccionPublica("flujos", {
            titulo: GUIA_FLUJOS.titulo,
            subtitulo: GUIA_FLUJOS.subtitulo,
            descripcion: GUIA_FLUJOS.descripcion,
        }),
        elContactoDeLaGuia("flujos"),
    ]);

    return (
        <>
            <CabeceraDeLaGuia demostracion={{ href: "#demostracion", texto: DEMOSTRACION }} modulo="Crear flujos" />
            {/* El vídeo arranca justo bajo la barra: su título vive en ella, y el
                aire de arriba es el mismo que el de los lados (px-4 / px-6). */}
            <div className={CONTENEDOR_DEL_INDICE}>
                <section id="demostracion" data-demostracion className="scroll-mt-20" aria-label={DEMOSTRACION}>
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

                <IntroduccionDeLaGuia introduccion={introduccion} />

                <section className="space-y-4" aria-labelledby="secciones">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 id="secciones" className="text-lg font-semibold text-slate-900">
                            Secciones
                        </h2>
                        <span className="text-sm text-slate-500">{SECCIONES.length} guías paso a paso</span>
                    </div>
                    <CuadriculaDeSecciones
                        secciones={SECCIONES}
                        moduloPath={CARPETA_DE_CAPTURAS}
                        contactoHref={contactoHref}
                        videoHref="#demostracion"
                    />
                </section>

                <FinDeLaGuia />
            </div>
        </>
    );
}
