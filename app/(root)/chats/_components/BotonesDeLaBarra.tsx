"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Los dos botones de la derecha de la barra de Chats.
 *
 * Viven aquí, y no sueltos dentro del sidebar, porque los pinta **también el
 * puente** que se ve mientras carga la página (`CachedSidebar`). Copiados a
 * mano en los dos sitios, el puente se quedó con la barra de hace tres
 * versiones —el botón de refrescar, el de abrir el panel— y al llegar la real
 * la barra cambiaba entera delante de quien estuviera mirando.
 *
 * Es el mismo componente en los dos: mientras lo sea, no pueden discrepar.
 */

type PropsDeAsesores = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Hay un asesor elegido en el filtro. */
    activo?: boolean;
    /** Cuántos asesores del EQUIPO hay dados de alta. */
    cantidad?: number;
};

/**
 * Filtrar por asesor.
 *
 * Con `forwardRef` porque en el sidebar es el disparador de un menú de Radix
 * (`DropdownMenuTrigger asChild`), que necesita la referencia del botón.
 */
export const BotonDeAsesores = React.forwardRef<HTMLButtonElement, PropsDeAsesores>(
    function BotonDeAsesores({ activo = false, cantidad = 0, className, ...resto }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                title="Filtrar por asesor"
                className={cn(
                    "relative inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 transition-colors sm:h-8 sm:px-2",
                    activo
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    className,
                )}
                {...resto}
            >
                <Users className="h-4 w-4 shrink-0" />
                {/* La insignia sí desaparece en cero —como en «No leídos»—, pero el
                    BOTÓN no: es estructura, y lo que no puede moverse al llegar los
                    datos. */}
                {cantidad > 0 && (
                    <span
                        className={cn(
                            "text-[10px] font-bold leading-none tabular-nums",
                            activo ? "text-primary" : "text-muted-foreground",
                        )}
                    >
                        {cantidad > 99 ? "99+" : cantidad}
                    </span>
                )}
                {activo && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                )}
            </button>
        );
    },
);

type PropsDeGrupos = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /** La pestaña abierta es «grupos». */
    activo?: boolean;
    cantidad?: number;
};

/** Solo grupos. */
export const BotonDeGrupos = React.forwardRef<HTMLButtonElement, PropsDeGrupos>(
    function BotonDeGrupos({ activo = false, cantidad = 0, className, ...resto }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                title="Solo grupos"
                aria-pressed={activo}
                className={cn(
                    "relative inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 transition-colors sm:h-8 sm:px-2",
                    activo
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    className,
                )}
                {...resto}
            >
                <Users className="h-4 w-4 shrink-0" />
                {cantidad > 0 && (
                    <span
                        className={cn(
                            "text-[10px] font-bold leading-none tabular-nums",
                            activo ? "text-white" : "text-emerald-600 dark:text-emerald-400",
                        )}
                    >
                        {cantidad > 99 ? "99+" : cantidad}
                    </span>
                )}
            </button>
        );
    },
);
