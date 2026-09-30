'use client';

import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * La tarjeta de un tutorial o de un manual en Documentación. La MISMA en las
 * dos pantallas: con una en cada una, el día que se afine una la otra se queda
 * atrás y dejan de parecerse.
 *
 * **Mide lo mismo tenga lo que tenga dentro**: el título reserva dos líneas y
 * la descripción otras dos (`min-h-[2lh]` y `line-clamp-2`), con el texto
 * entero en el `title`. Antes cada tarjeta medía lo que medía su texto, y al
 * bajar por la rejilla las filas salían de alturas distintas: se leía
 * desordenado. Así todas las filas son iguales y los botones caen en la misma
 * línea.
 *
 * El asa de reordenar va arriba a la DERECHA (`TarjetaOrdenable asa="derecha"`)
 * porque arriba a la izquierda está el título; `conAsa` le deja su sitio.
 */
export function TarjetaDeDocumento({
    titulo,
    detalle,
    descripcion,
    alVer,
    alEditar,
    alEliminar,
    conAsa = false,
}: {
    titulo: string;
    /** Una línea pequeña debajo del título (en qué pantalla sale un tutorial). */
    detalle?: string | null;
    descripcion?: string | null;
    alVer: () => void;
    /** Sin él no se pinta el lápiz: quien no puede editar no lo ve. */
    alEditar?: () => void;
    alEliminar?: () => void;
    conAsa?: boolean;
}) {
    return (
        <div
            data-tarjeta-de-recurso
            className="flex h-full flex-col rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md"
        >
            <p
                className={cn('line-clamp-2 min-h-[2lh] text-sm font-semibold leading-snug', conAsa && 'pr-8')}
                title={titulo}
                data-titulo-de-recurso
            >
                {titulo}
            </p>
            <p className="mt-1 min-h-[1lh] truncate text-xs text-muted-foreground" title={detalle ?? undefined} data-detalle-de-recurso>
                {detalle ?? ''}
            </p>
            <p
                className="mt-2 line-clamp-2 min-h-[2lh] text-sm leading-snug text-muted-foreground"
                title={descripcion ?? undefined}
                data-descripcion-de-recurso
            >
                {descripcion?.trim() || 'Sin descripción.'}
            </p>
            <div className="mt-auto flex items-center gap-2 pt-3" data-botones-de-recurso>
                <Button size="sm" className="h-8 flex-1" onClick={alVer}>
                    <Eye className="h-4 w-4" aria-hidden />
                    Ver
                </Button>
                {alEditar ? (
                    <Button size="icon" variant="secondary" className="h-8 w-8 shrink-0" onClick={alEditar} aria-label="Editar" title="Editar">
                        <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                ) : null}
                {alEliminar ? (
                    <Button size="icon" variant="destructive" className="h-8 w-8 shrink-0" onClick={alEliminar} aria-label="Eliminar" title="Eliminar">
                        <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

/** La rejilla de esas tarjetas: la misma medida en Guías y en Tutoriales. */
export const REJILLA_DE_DOCUMENTOS = 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]';
