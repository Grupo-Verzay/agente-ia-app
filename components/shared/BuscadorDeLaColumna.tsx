"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * El buscador de la cabecera de una columna lateral: el de Chats y el de
 * Correo. Vivía escrito dentro de `ChatSearchBar`, y Correo tenía el suyo —más
 * alto, cuadrado, con otro glifo y con el filtro metido dentro— así que las dos
 * cabeceras no se leían como la misma plataforma. Se pinta desde aquí: 28 px
 * de alto, redondo, lupa de 14 y la equis de limpiar.
 *
 * Se lleva lo que sobra de la fila (`flex-1`) y nunca baja de 36 px: en una
 * columna estrecha cede él, no los iconos.
 */
export function BuscadorDeLaColumna({
    value,
    onChange,
    onClear,
    placeholder = "Buscar...",
    ariaLabel,
}: {
    value: string;
    onChange: (valor: string) => void;
    onClear: () => void;
    placeholder?: string;
    ariaLabel: string;
}) {
    return (
        <div data-buscador-de-la-columna className="relative min-w-[36px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-7 rounded-full pl-7 pr-7 text-xs sm:text-sm"
                aria-label={ariaLabel}
            />
            {value && (
                <button
                    type="button"
                    aria-label="Limpiar busqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={onClear}
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}
