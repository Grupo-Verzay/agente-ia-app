import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    CabeceraDeLaGuia,
    Consejos,
    IconoDeSeccion,
    NavegacionEntreSecciones,
    PasoDeLaGuia,
} from "@/components/guia/Guia";
import { CARPETA_DE_CAPTURAS, laSeccion, lasVecinas, SECCIONES } from "@/lib/guia-leads";

/**
 * Una sección de la guía de Leads, con sus pasos y sus capturas. Se genera
 * entera al construir (`generateStaticParams`): no hay nada que leer de la
 * base, así que no tiene por qué pintarse en cada visita.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return SECCIONES.map((s) => ({ seccion: s.slug }));
}

export function generateMetadata({ params }: { params: { seccion: string } }): Metadata {
    const seccion = laSeccion(params.seccion);
    return { title: seccion ? `${seccion.titulo} · Leads` : "Leads" };
}

export default function SeccionDeLaGuiaDeLeads({ params }: { params: { seccion: string } }) {
    const seccion = laSeccion(params.seccion);
    if (!seccion) notFound();
    const numero = SECCIONES.findIndex((s) => s.slug === seccion.slug) + 1;
    const { anterior, siguiente } = lasVecinas(seccion.slug);

    return (
        <>
            <CabeceraDeLaGuia volver={{ href: "/guia/leads", texto: "Todas las secciones" }} modulo="Leads" />
            <article className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
                <header className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <IconoDeSeccion nombre={seccion.icono} className="h-5 w-5" />
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Leads · Sección {numero} de {SECCIONES.length}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{seccion.titulo}</h1>
                    <p className="text-base leading-relaxed text-slate-600">{seccion.resumen}</p>
                </header>

                <ol className="space-y-10">
                    {seccion.pasos.map((p, i) => (
                        <PasoDeLaGuia key={p.imagen + i} paso={p} numero={i + 1} carpeta={CARPETA_DE_CAPTURAS} />
                    ))}
                </ol>

                <Consejos consejos={seccion.consejos ?? []} />

                <NavegacionEntreSecciones anterior={anterior} siguiente={siguiente} moduloPath="/guia/leads" />
            </article>
        </>
    );
}
