import type { HTMLAttributes, ReactNode } from "react";
import { BookOpen, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Una fila de la lista vertical de guías: icono, título, descripción y «Ver»,
 * que abre la guía pública (`/guia/<modulo>`) con su vídeo en otra pestaña.
 *
 * La pintan DOS pantallas y por eso vive aquí: Documentación › Guías, donde la
 * casa le añade «Editar introducción» (`children`), y el centro de ayuda
 * (`/ayuda/<categoria>`), donde solo lleva «Ver». Con una copia en cada una,
 * el día que se afine la fila se afina en una y la otra se queda atrás.
 */
export function FilaDeGuia({
    titulo,
    descripcion,
    url,
    conAsa = false,
    children,
    className,
    ...resto
}: {
    titulo: string;
    descripcion?: string | null;
    url: string;
    /** Va dentro de una lista que se reordena: le deja sitio al asa a la izquierda. */
    conAsa?: boolean;
    /** Lo que va detrás de «Ver» (Documentación › Guías: «Editar introducción»). */
    children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            {...resto}
            data-fila-de-guia
            className={`flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3${conAsa ? " pl-11" : ""}${className ? ` ${className}` : ""}`}
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <BookOpen className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" data-titulo-de-la-fila>
                    {titulo}
                </p>
                {descripcion ? <p className="text-xs text-muted-foreground">{descripcion}</p> : null}
            </div>
            <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer" data-ver-guia>
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Ver
                </a>
            </Button>
            {children}
        </div>
    );
}
