"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CabeceraDeDocumentacion } from "@/components/documentacion/CabeceraDeDocumentacion";
import { IconoDeCategoria } from "@/components/ayuda/IconoDeCategoria";
import {
    CATEGORIAS_DE_AYUDA,
    buscarEnLasGuias,
    cuantasPorCategoria,
    elEnlaceDeLaCategoria,
    elNumeroDeGuias,
    laCategoria,
    lasPantallasEnUnaFrase,
    type GuiaDeAyuda,
} from "@/lib/centro-de-ayuda";

/**
 * La portada del centro de ayuda (`/ayuda`): un buscador arriba que recorre
 * TODAS las guías de cualquier categoría, y debajo las diez categorías —una
 * por cada grupo del menú lateral—, en dos columnas y siempre las diez.
 *
 * El buscador lleva directo a lo que coincide: cada resultado es un enlace a
 * la guía, o a su sección si lo que coincidió es de una. Enter abre el
 * primero (o el que se marque con las flechas). Abre en otra pestaña, igual
 * que «Ver» en las listas: la guía es una página pública sin el marco de la
 * plataforma, y así no se pierde lo que se tenía abierto.
 */
export function CentroDeAyuda({ guias }: { guias: GuiaDeAyuda[] }) {
    const [consulta, setConsulta] = useState("");
    const [marcado, setMarcado] = useState(0);
    const [abierto, setAbierto] = useState(false);
    const id = useId();
    const entrada = useRef<HTMLInputElement>(null);

    const resultados = useMemo(() => buscarEnLasGuias(guias, consulta), [guias, consulta]);
    const cuantas = useMemo(() => cuantasPorCategoria(guias), [guias]);
    const hayConsulta = consulta.trim().length > 0;
    const seVeLaLista = abierto && hayConsulta;

    const abrir = (url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setMarcado((m) => Math.min(m + 1, Math.max(resultados.length - 1, 0)));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarcado((m) => Math.max(m - 1, 0));
        } else if (e.key === "Enter") {
            const r = resultados[marcado] ?? resultados[0];
            if (r) {
                e.preventDefault();
                abrir(r.url);
            }
        } else if (e.key === "Escape") {
            setConsulta("");
            setMarcado(0);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4" data-centro-de-ayuda>
            <CabeceraDeDocumentacion
                titulo="Centro de ayuda"
                subtitulo="Busca una guía o entra por la parte de la plataforma que quieres aprender."
                volverA={null}
            />

            <div className="relative" data-buscador-de-ayuda>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                    ref={entrada}
                    type="search"
                    role="combobox"
                    aria-label="Buscar en todas las guías"
                    aria-expanded={seVeLaLista}
                    aria-controls={`${id}-resultados`}
                    aria-activedescendant={seVeLaLista && resultados[marcado] ? `${id}-r${marcado}` : undefined}
                    autoComplete="off"
                    placeholder="Busca una guía: exportar, etiquetas, catálogo…"
                    className="h-11 pl-10 text-base"
                    value={consulta}
                    onChange={(e) => {
                        setConsulta(e.target.value);
                        setMarcado(0);
                        setAbierto(true);
                    }}
                    onFocus={() => setAbierto(true)}
                    onBlur={() => setAbierto(false)}
                    onKeyDown={alTeclear}
                />

                {seVeLaLista ? (
                    <div
                        id={`${id}-resultados`}
                        role="listbox"
                        data-resultados-de-ayuda
                        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                    >
                        {resultados.length === 0 ? (
                            <p className="px-3 py-4 text-center text-sm text-muted-foreground" data-sin-resultados>
                                Ninguna guía coincide con «{consulta.trim()}».
                            </p>
                        ) : (
                            resultados.map((r, i) => {
                                const categoria = laCategoria(r.guia.categoria);
                                return (
                                    <a
                                        key={`${r.guia.modulo}-${r.seccion?.slug ?? ""}`}
                                        id={`${id}-r${i}`}
                                        role="option"
                                        aria-selected={i === marcado}
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-resultado-de-ayuda={r.guia.modulo}
                                        data-seccion={r.seccion?.slug ?? ""}
                                        // El `blur` de la caja llega antes que el `click`: sin
                                        // esto la lista se cerraría justo antes de que el clic
                                        // llegara al enlace.
                                        onMouseDown={(e) => e.preventDefault()}
                                        onMouseEnter={() => setMarcado(i)}
                                        onClick={() => setAbierto(false)}
                                        className={`flex items-start gap-3 rounded-md px-3 py-2 text-left ${i === marcado ? "bg-accent text-accent-foreground" : ""}`}
                                    >
                                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                                            <BookOpen className="h-4 w-4" aria-hidden />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-baseline gap-x-2">
                                                <span className="text-sm font-medium">{r.guia.titulo}</span>
                                                {categoria ? <span className="text-xs text-muted-foreground">{categoria.nombre}</span> : null}
                                            </span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {r.seccion ? `Sección: ${r.seccion.titulo}` : r.guia.descripcion}
                                            </span>
                                        </span>
                                    </a>
                                );
                            })
                        )}
                    </div>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto py-1">
                <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2" data-categorias-de-ayuda>
                    {CATEGORIAS_DE_AYUDA.map((c) => {
                        const n = cuantas[c.slug] ?? 0;
                        const pantallas = lasPantallasEnUnaFrase(c);
                        return (
                            <Link
                                key={c.slug}
                                href={elEnlaceDeLaCategoria(c.slug)}
                                data-categoria-de-ayuda={c.slug}
                                className="group flex h-full items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                                    <IconoDeCategoria nombre={c.icono} className="h-6 w-6" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-base font-semibold" data-nombre-de-la-categoria>
                                            {c.nombre}
                                        </span>
                                        <span
                                            data-guias-de-la-categoria={n}
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                n > 0
                                                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                                    : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {n > 0 ? elNumeroDeGuias(n) : "Próximamente"}
                                        </span>
                                    </span>
                                    <span className="mt-1 block truncate text-sm text-muted-foreground" title={pantallas}>
                                        {pantallas}
                                    </span>
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
