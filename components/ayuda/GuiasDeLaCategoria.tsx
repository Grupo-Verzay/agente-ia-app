"use client";

import { useState } from "react";
import { BookOpen, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { BarraDeAcciones } from "@/components/shared/BarraDeAcciones";
import { CabeceraDeDocumentacion } from "@/components/documentacion/CabeceraDeDocumentacion";
import { FilaDeGuia } from "@/components/documentacion/FilaDeGuia";
import {
    RUTA_DEL_CENTRO_DE_AYUDA,
    SIN_GUIAS_TODAVIA,
    lasPantallasEnUnaFrase,
    pasaElFiltroDeLaCategoria,
    type CategoriaDeAyuda,
    type GuiaDeAyuda,
} from "@/lib/centro-de-ayuda";

/**
 * Las guías de UNA categoría del centro de ayuda (`/ayuda/<categoria>`).
 *
 * Es la lista vertical de Documentación › Guías —su buscador, y cada fila con
 * icono, título, descripción y «Ver»— SIN lo de administrar: ni «+ Nuevo», ni
 * «Editar introducción», ni arrastrar para reordenar, ni el rótulo «Guías
 * publicadas». Esto es para aprender, no para editar, y lo ve cualquiera.
 *
 * Una categoría sin guías todavía lo dice («Estamos trabajando en esta guía»)
 * y no enseña el buscador: un buscador sobre nada es un mando que no hace nada.
 */
export function GuiasDeLaCategoria({
    categoria,
    guias,
    raiz = RUTA_DEL_CENTRO_DE_AYUDA,
    alVolver,
    alAbrirGuia,
    incrustado = false,
}: {
    categoria: CategoriaDeAyuda;
    guias: GuiaDeAyuda[];
    /** A dónde vuelve la flecha: `/ayuda` en el panel. */
    raiz?: string;
    /** La landing: la flecha vuelve a las categorías sin navegar. */
    alVolver?: () => void;
    /** La landing: «Ver» abre la guía en la misma página, sin navegar. */
    alAbrirGuia?: (modulo: string) => void;
    /** Dentro de una sección de la landing: sin relleno y con el alto de su contenido. */
    incrustado?: boolean;
}) {
    const [consulta, setConsulta] = useState("");
    // Fuera del JSX: la fila tiene que seguir siendo UNA etiqueta sin hijos.
    const verLaGuia = (modulo: string) => (alAbrirGuia ? () => alAbrirGuia(modulo) : undefined);
    const queSeVen = guias.filter((g) => pasaElFiltroDeLaCategoria(g, consulta));

    return (
        <div
            className={incrustado ? "flex flex-col gap-4" : "flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4"}
            data-guias-de-la-categoria={categoria.slug}
        >
            <CabeceraDeDocumentacion
                titulo={categoria.nombre}
                subtitulo={lasPantallasEnUnaFrase(categoria)}
                volverA={
                    alVolver
                        ? { alPulsar: alVolver, etiqueta: "Volver a tutoriales" }
                        : { href: raiz, etiqueta: "Volver al centro de ayuda" }
                }
            />

            {guias.length > 0 ? (
                <BarraDeAcciones
                    buscador={
                        <div className="relative w-56 sm:w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar guía..."
                                aria-label={`Buscar en las guías de ${categoria.nombre}`}
                                className="pl-8"
                                value={consulta}
                                onChange={(e) => setConsulta(e.target.value)}
                            />
                        </div>
                    }
                />
            ) : null}

            <div className={incrustado ? "py-1" : "min-h-0 flex-1 overflow-auto py-1"}>
                {guias.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center" data-sin-guias-todavia>
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                            <BookOpen className="h-6 w-6" aria-hidden />
                        </span>
                        <p className="text-base font-medium">{SIN_GUIAS_TODAVIA}</p>
                    </div>
                ) : queSeVen.length === 0 ? (
                    <p className="py-10 text-center text-muted-foreground">Ninguna guía coincide con «{consulta.trim()}».</p>
                ) : (
                    <div className="grid gap-2" data-lista-de-guias>
                        {queSeVen.map((g) => (
                            <FilaDeGuia key={g.modulo} data-guia-de-ayuda={g.modulo} titulo={g.titulo} descripcion={g.descripcion} url={g.url} alVer={verLaGuia(g.modulo)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
