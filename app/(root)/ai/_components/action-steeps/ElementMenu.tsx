"use client";

import { FC } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Menu de los tres puntos de una tarjeta de elemento (texto, ejecutar flujo,
 * captura de datos...).
 *
 * Antes cada tarjeta llevaba un boton de basura suelto arriba a la derecha,
 * gris y del tamano de los demas botones: quedaba a un clic de distancia por
 * accidente y ademas se repetia en las siete tarjetas. Aqui esta una sola vez
 * y borrar queda un paso mas adentro.
 */
export const ElementMenu: FC<{ onRemove: () => void; label?: string }> = ({
    onRemove,
    label = "Eliminar",
}) => (
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
        <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onRemove}
            >
                <Trash2 className="mr-2 h-4 w-4" />
                {label}
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);
