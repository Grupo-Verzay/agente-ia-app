"use client";

import { FC } from "react";
import { Braces, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Los botones de la esquina de una tarjeta de elemento (texto, ejecutar flujo,
 * captura de datos...).
 *
 * Borrar va A LA VISTA, como estaba y como sigue estando en Extras y en los
 * pasos. Se probó a esconderlo detrás de los tres puntos para que no se pulsara
 * por accidente, y el remedio salió peor: quien quería borrar un elemento ya no
 * encontraba cómo, y cada listado de la pantalla pedía un gesto distinto.
 *
 * Los tres puntos se quedan solo donde hay algo más que ofrecer —hoy Variables,
 * en Regla/parámetro—. Sin eso no se pintan: un menú con una sola entrada es un
 * clic de más para llegar al mismo sitio.
 */
export const ElementMenu: FC<{
    onRemove: () => void;
    label?: string;
    /** Solo lo pasa Regla/parametro: abre el listado de variables del sistema. */
    onVariables?: () => void;
}> = ({ onRemove, label = "Eliminar", onVariables }) => (
    <div className="flex shrink-0 items-center gap-1">
        {onVariables && (
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        title="Más opciones"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                        <MoreVertical className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={onVariables}>
                        <Braces className="mr-2 h-4 w-4" />
                        Variables
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )}

        <Button
            variant="secondary"
            size="icon"
            onClick={onRemove}
            title={label}
            className="bg-gray-400 hover:bg-gray-500 text-white dark:bg-zinc-600 dark:hover:bg-zinc-500"
        >
            <Trash2 className="h-4 w-4" />
        </Button>
    </div>
);
