"use client";

import { Eye, Pencil, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    NIVELES_DE_ACCESO,
    NOMBRE_DEL_NIVEL,
    type NivelDeAcceso,
} from "@/lib/niveles-de-acceso";

/**
 * Los tres niveles de acceso, como una fila de tres botones.
 *
 * Es el control que Notas tenía dentro de su `ShareNoteDialog`, sacado aquí
 * para que lo use también Documentación. **No es una copia**: el fichero de
 * Notas ya no lo pinta, lo importa. Con dos, el día que se afine el rótulo o el
 * color del elegido se afina en una pantalla y la otra se queda atrás, y eso no
 * se ve como un error sino como que «compartir en Documentos es otra cosa».
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Los tres salen siempre, y «Sin acceso» es uno de ellos.** Quitar el
 *    acceso con una papelera al otro lado de la fila —que es como estaba en
 *    Documentación— obliga a buscar en otro sitio para deshacer lo que se acaba
 *    de hacer aquí; y con los tres delante, el que está puesto se lee sin
 *    pulsar nada.
 * 2. **`aria-pressed` y no solo el color.** Cuál está elegido tiene que poder
 *    saberse sin ver: son tres botones, no un grupo de radio, así que sin esto
 *    un lector de pantalla los lee los tres igual.
 * 3. **El rótulo se esconde en pantalla estrecha, el icono no.** Tres palabras
 *    por botón no caben en un diálogo de móvil, y un icono suelto sin `title`
 *    es un botón que no dice qué hace: los dos van, el `title` siempre.
 */
export function NivelesDeAcceso({
    valor,
    alElegir,
    deshabilitado,
    className,
}: {
    valor: NivelDeAcceso;
    alElegir: (nivel: NivelDeAcceso) => void;
    deshabilitado?: boolean;
    className?: string;
}) {
    const iconos: Record<NivelDeAcceso, typeof Eye> = {
        ninguno: UserX,
        lectura: Eye,
        edicion: Pencil,
    };

    return (
        <div className={cn("grid grid-cols-3 gap-1", className)}>
            {NIVELES_DE_ACCESO.map((nivel) => {
                const Icono = iconos[nivel];
                const elegido = valor === nivel;
                return (
                    <button
                        key={nivel}
                        type="button"
                        aria-pressed={elegido}
                        title={NOMBRE_DEL_NIVEL[nivel]}
                        onClick={() => alElegir(nivel)}
                        disabled={deshabilitado}
                        className={cn(
                            "flex items-center justify-center gap-1 rounded-md border px-2 py-1.5",
                            "text-xs transition-colors disabled:opacity-50",
                            elegido
                                ? "border-primary bg-primary/10 font-medium text-primary"
                                : "border-border text-muted-foreground hover:bg-muted",
                        )}
                    >
                        <Icono className="size-3.5 shrink-0" />
                        <span className="hidden truncate sm:inline">
                            {NOMBRE_DEL_NIVEL[nivel]}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
