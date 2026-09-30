import Link from "next/link";
import {
    Archive,
    ArrowLeft,
    ArrowLeftRight,
    ArrowRight,
    BookOpen,
    CalendarPlus,
    CircleDot,
    ClipboardList,
    Unlink,
    Columns3,
    DoorOpen,
    Download,
    ExternalLink,
    FileStack,
    FileText,
    Filter,
    FolderOpen,
    GitBranch,
    History,
    LayoutDashboard,
    LayoutGrid,
    Lightbulb,
    Link2,
    Maximize2,
    MessageCircle,
    MessageSquare,
    Mic,
    MoreHorizontal,
    Palette,
    PenLine,
    PlayCircle,
    PlusCircle,
    Search,
    Share2,
    Sheet,
    SlidersHorizontal,
    StickyNote,
    Store,
    ToggleRight,
    Trash2,
    TriangleAlert,
    Type,
    UserPlus,
    Users,
    Video,
} from "lucide-react";

import type { Paso, Seccion } from "@/lib/guia-de-modulo";
import { lasClasesDelCierre } from "@/lib/cierre-de-la-guia";
import { losParrafos, type Introduccion } from "@/lib/introduccion-de-la-guia";

/**
 * Las piezas de la guía pública. Sin `"use client"`: no hay nada que hacer en
 * el navegador, así que llega entera como HTML, que es lo que carga rápido en
 * un teléfono. Mobile-first: se pinta para 360 px y de `sm` para arriba gana
 * aire.
 */

/**
 * Un icono por nombre de `ICONOS_DE_SECCION` (`lib/guia-de-modulo.ts`). El
 * tipo obliga a que estén todos: un nombre de la lista sin su icono aquí no
 * compila, en vez de pintar una tarjeta sin icono.
 */
const ICONOS: Record<Seccion["icono"], typeof Search> = {
    LayoutDashboard,
    Columns3,
    ToggleRight,
    Filter,
    Search,
    Download,
    UserPlus,
    MoreHorizontal,
    Link2,
    MessageCircle,
    Palette,
    Type,
    Share2,
    SlidersHorizontal,
    Store,
    PlusCircle,
    Users,
    FolderOpen,
    PenLine,
    GitBranch,
    StickyNote,
    LayoutGrid,
    CalendarPlus,
    Video,
    Mic,
    DoorOpen,
    MessageSquare,
    CircleDot,
    History,
    FileStack,
    Archive,
    Sheet,
    ExternalLink,
    ArrowLeftRight,
    TriangleAlert,
    ClipboardList,
    Unlink,
    Trash2,
    FileText,
};

export function IconoDeSeccion({ nombre, className }: { nombre: Seccion["icono"]; className?: string }) {
    const Icono = ICONOS[nombre];
    return <Icono className={className} aria-hidden />;
}

/**
 * La barra de arriba de toda guía: UNA sola fila compacta, y simétrica.
 *
 *   [Guía de la plataforma]   [▶ Demostración en 1 minuto]   [Módulo X]
 *
 * Es una rejilla de tres columnas con los dos lados IGUALES
 * (`minmax(0,1fr) auto minmax(0,1fr)`): el centro cae en el centro de la barra
 * pase lo que mida cada lado. En el índice el centro es el enlace a la
 * demostración —el vídeo va justo debajo, sin un título aparte que lo repita—;
 * en una sección no hay vídeo y el centro queda vacío. En un teléfono el
 * «Guía de la plataforma» se queda en su icono para que quepan los tres. Lo
 * mide `scripts/probar-cabecera-de-la-guia.mjs`.
 */
export function CabeceraDeLaGuia({
    volver,
    demostracion,
    modulo,
}: {
    volver?: { href: string; texto: string };
    /** El ancla del vídeo del índice: si viene, la barra la ofrece en el centro. */
    demostracion?: { href: string; texto: string };
    /** El nombre del módulo, tal cual lo ve el cliente en el menú. */
    modulo: string;
}) {
    return (
        <header data-cabecera-de-la-guia className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto grid h-14 w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 sm:gap-3 sm:px-6">
                <div data-lado="izquierdo" className="flex min-w-0 justify-self-start">
                    {volver ? (
                        <Link
                            href={volver.href}
                            className="-ml-2 inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="truncate">{volver.texto}</span>
                        </Link>
                    ) : (
                        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900" title="Guía de la plataforma">
                            <BookOpen className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                            <span className={demostracion ? "sr-only truncate sm:not-sr-only" : "truncate"}>Guía de la plataforma</span>
                        </span>
                    )}
                </div>
                {demostracion ? (
                    <a
                        href={demostracion.href}
                        data-lado="centro"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-semibold text-slate-900 hover:bg-slate-100 sm:gap-2 sm:text-sm"
                    >
                        <PlayCircle className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                        {demostracion.texto}
                    </a>
                ) : (
                    <span data-lado="centro" aria-hidden />
                )}
                <div data-lado="derecho" className="flex min-w-0 justify-self-end">
                    <span className="truncate rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        Módulo {modulo}
                    </span>
                </div>
            </div>
        </header>
    );
}

/**
 * Una captura: con borde, sombra y un enlace para verla a tamaño completo.
 *
 * `carpeta` es la de la guía (`/guia/<modulo>`, `laGuiaDe`): la misma
 * dirección sirve las páginas y, en `public/`, sus capturas.
 */
export function Captura({ carpeta, imagen, alt, prioridad = false }: { carpeta: string; imagen: string; alt: string; prioridad?: boolean }) {
    const src = `${carpeta}/${imagen}`;
    return (
        <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-blue-500/0 transition hover:shadow-md hover:ring-2 hover:ring-blue-500/30"
            title="Ver la imagen a tamaño completo"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt}
                loading={prioridad ? "eager" : "lazy"}
                decoding="async"
                className="block h-auto w-full"
            />
            <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-900/70 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                <Maximize2 className="h-3 w-3" aria-hidden />
                Ampliar
            </span>
        </a>
    );
}

export function TarjetaDeSeccion({
    seccion,
    numero,
    moduloPath,
}: {
    seccion: Seccion;
    numero: number;
    /** La carpeta de la guía (`/guia/<modulo>`): de ahí cuelgan la sección y su miniatura. */
    moduloPath: string;
}) {
    return (
        <Link
            href={`${moduloPath}/${seccion.slug}`}
            data-tarjeta-de-seccion={seccion.slug}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
        >
            <div className="aspect-[16/9] overflow-hidden border-b border-slate-100 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`${moduloPath}/${seccion.miniatura}`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover object-left-top transition duration-300 group-hover:scale-[1.02]"
                />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <IconoDeSeccion nombre={seccion.icono} className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Sección {numero}
                    </span>
                </div>
                <h2 className="text-base font-semibold leading-snug text-slate-900">{seccion.titulo}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{seccion.resumen}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-blue-600">
                    Ver la guía
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
            </div>
        </Link>
    );
}

export function PasoDeLaGuia({ carpeta, paso, numero }: { carpeta: string; paso: Paso; numero: number }) {
    return (
        <li data-paso className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                    {numero}
                </span>
                <div className="min-w-0 space-y-1 pt-0.5">
                    <h3 className="text-base font-semibold leading-snug text-slate-900">{paso.titulo}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{paso.texto}</p>
                </div>
            </div>
            <Captura carpeta={carpeta} imagen={paso.imagen} alt={paso.alt} prioridad={numero === 1} />
        </li>
    );
}

export function Consejos({ consejos }: { consejos: string[] }) {
    if (consejos.length === 0) return null;
    return (
        <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Lightbulb className="h-4 w-4" aria-hidden />
                Bueno saber
            </p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-amber-900/90">
                {consejos.map((c) => (
                    <li key={c} className="flex gap-2">
                        <span aria-hidden>•</span>
                        <span>{c}</span>
                    </li>
                ))}
            </ul>
        </aside>
    );
}

export function NavegacionEntreSecciones({
    carpeta,
    anterior,
    siguiente,
}: {
    /** La carpeta de la guía (`/guia/<modulo>`): el índice y sus secciones. */
    carpeta: string;
    anterior: Seccion | null;
    siguiente: Seccion | null;
}) {
    return (
        <nav className="grid gap-3 sm:grid-cols-2" aria-label="Otras secciones">
            {anterior ? (
                <Link
                    href={`${carpeta}/${anterior.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0">
                        <span className="block text-xs text-slate-500">Anterior</span>
                        <span className="block truncate text-sm font-medium text-slate-900">{anterior.titulo}</span>
                    </span>
                </Link>
            ) : (
                <span className="hidden sm:block" />
            )}
            {siguiente ? (
                <Link
                    href={`${carpeta}/${siguiente.slug}`}
                    className="flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-right hover:border-blue-300"
                >
                    <span className="min-w-0">
                        <span className="block text-xs text-slate-500">Siguiente</span>
                        <span className="block truncate text-sm font-medium text-slate-900">{siguiente.titulo}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </Link>
            ) : (
                <Link
                    href={carpeta}
                    className="flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-right hover:border-blue-300"
                >
                    <span className="block text-sm font-medium text-slate-900">Volver al índice</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </Link>
            )}
        </nav>
    );
}

/**
 * El bloque de introducción del índice. El texto es editable (ver `lib/introduccion-de-la-guia.ts`).
 *
 * Los párrafos ocupan el ancho ENTERO del contenedor, como el vídeo y la
 * cuadrícula de encima y de debajo. Llevaron un `max-w-3xl` (768 px) que en
 * escritorio los cortaba antes que todo lo demás y dejaba un hueco a la
 * derecha; en tablet y móvil el contenedor ya mide menos que eso, así que
 * quitarlo solo cambia el escritorio. Lo mide `scripts/probar-introduccion-de-la-guia.mjs`.
 */
export function IntroduccionDeLaGuia({ introduccion }: { introduccion: Introduccion }) {
    return (
        <section data-introduccion-de-la-guia className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Guía del módulo</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{introduccion.titulo}</h1>
            <p className="text-lg font-medium text-slate-700">{introduccion.subtitulo}</p>
            <div className="space-y-3">
                {losParrafos(introduccion.descripcion).map((p, i) => (
                    <p key={i} className="text-base leading-relaxed text-slate-600">
                        {p}
                    </p>
                ))}
            </div>
        </section>
    );
}

/** Sin `display`: cada tarjeta pone el suyo (la del vídeo nace `hidden`). */
const MARCO_DE_TARJETA =
    "flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

/**
 * La cuadrícula de secciones CON sus tarjetas de cierre. Qué tarjetas van y
 * cuánto ocupa cada una en cada anchura lo decide `lasClasesDelCierre`: aquí
 * solo se pintan. Vale para la guía de cualquier módulo.
 */
export function CuadriculaDeSecciones({
    secciones,
    moduloPath,
    contactoHref,
    videoHref,
}: {
    secciones: readonly Seccion[];
    moduloPath: string;
    contactoHref: string;
    videoHref: string;
}) {
    const cierre = lasClasesDelCierre(secciones.length);
    return (
        <div data-cuadricula-de-secciones className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {secciones.map((s, i) => (
                <TarjetaDeSeccion key={s.slug} seccion={s} numero={i + 1} moduloPath={moduloPath} />
            ))}
            <a
                href={contactoHref}
                target="_blank"
                rel="noopener noreferrer"
                data-tarjeta-de-cierre="contacto"
                className={`flex ${cierre.contacto} group ${MARCO_DE_TARJETA} border-blue-200 bg-gradient-to-br from-blue-600 to-blue-500 text-white hover:border-blue-300`}
            >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                    <MessageCircle className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-base font-semibold leading-snug">¿Te quedó alguna duda?</h2>
                <p className="max-w-md text-sm leading-relaxed text-blue-50">
                    Escríbenos y te ayudamos a sacarle todo el provecho al módulo.
                </p>
                <span className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-blue-700">
                    Contáctanos
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
            </a>
            {cierre.video ? (
                <a
                    href={videoHref}
                    data-tarjeta-de-cierre="video"
                    className={`${cierre.video} group ${MARCO_DE_TARJETA} border-slate-200 bg-white hover:border-blue-300`}
                >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <PlayCircle className="h-5 w-5" aria-hidden />
                    </span>
                    <h2 className="text-base font-semibold leading-snug text-slate-900">Ver el vídeo de nuevo</h2>
                    <p className="max-w-md text-sm leading-relaxed text-slate-600">La demostración completa del módulo en un minuto.</p>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                        Ir al vídeo
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                    </span>
                </a>
            ) : null}
        </div>
    );
}

/**
 * El índice de una guía termina en la línea divisoria que sigue a las
 * tarjetas de cierre, y NADA debajo: ni una nota («las capturas se toman
 * automáticamente…» era una nota interna que al cliente no le dice nada) ni
 * relleno. Por eso el contenedor no lleva `pb-*` y `FinDeLaGuia` es lo último
 * que se pinta. Toda guía nueva usa las dos; lo comprueba
 * `lib/__tests__/fin-de-la-guia.test.mjs`.
 */
export const CONTENEDOR_DEL_INDICE = "mx-auto w-full max-w-5xl space-y-10 px-4 pt-4 sm:px-6 sm:pt-6";

export function FinDeLaGuia() {
    return <hr data-fin-de-la-guia className="border-0 border-t border-slate-200" />;
}
