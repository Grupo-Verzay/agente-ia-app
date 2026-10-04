import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    CabeceraDeLaGuia,
    Consejos,
    IconoDeSeccion,
    NavegacionEntreSecciones,
    PasoDeLaGuia,
} from "@/components/guia/Guia";
import { CARPETA_DE_CAPTURAS, laSeccion, lasVecinas, SECCIONES } from "@/lib/guia-catalogo";

/**
 * Una sección de la guía de Catálogo, con sus pasos y sus capturas (la misma
 * página que la de Leads). Se genera
 * entera al construir (`generateStaticParams`): no hay nada que leer de la
 * base, así que no tiene por qué pintarse en cada visita.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return SECCIONES.map((s) => ({ seccion: s.slug }));
}

export function generateMetadata({ params }: { params: { seccion: string } }): Metadata {
    const seccion = laSeccion(params.seccion);
    return { title: seccion ? `${seccion.titulo} · Catálogo` : "Catálogo" };
}

export default function SeccionDeLaGuiaDeCatalogo({ params }: { params: { seccion: string } }) {
    const seccion = laSeccion(params.seccion);
    if (!seccion) notFound();
    const numero = SECCIONES.findIndex((s) => s.slug === seccion.slug) + 1;
    const { anterior, siguiente } = lasVecinas(seccion.slug);

    return (
        <>
            <CabeceraDeLaGuia volver={{ href: CARPETA_DE_CAPTURAS, texto: "Todas las secciones" }} modulo="Catálogo" />
            <article className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
                <header className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-guia-acento-suave text-guia-acento">
                            <IconoDeSeccion nombre={seccion.icono} className="h-5 w-5" />
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-guia-tenue">
                            Catálogo · Sección {numero} de {SECCIONES.length}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-guia-texto sm:text-3xl">{seccion.titulo}</h1>
                    <p className="text-base leading-relaxed text-guia-medio">{seccion.resumen}</p>
                </header>

                <ol className="space-y-10">
                    {seccion.pasos.map((p, i) => (
                        <PasoDeLaGuia key={p.imagen + i} carpeta={CARPETA_DE_CAPTURAS} paso={p} numero={i + 1} />
                    ))}
                </ol>

                <Consejos consejos={seccion.consejos ?? []} />

                <NavegacionEntreSecciones carpeta={CARPETA_DE_CAPTURAS} anterior={anterior} siguiente={siguiente} />
            </article>
        </>
    );
}
