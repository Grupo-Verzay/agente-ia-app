"use client";

import { Filter } from "lucide-react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    ETIQUETAS_DE_FILTRO,
    FILTROS_DE_VENCIMIENTO,
    type FiltroDeVencimiento,
} from "@/lib/vencimiento";

/**
 * El filtro de vencimiento de un tablero, el mismo en Proyectos y en Tickets.
 *
 * **Puesto se NOTA**: en azul y con su icono, como el estado de Clientes. Un
 * filtro aplicado que no se distingue del que no filtra es lo que hace pensar
 * que faltan tarjetas — ya costó una vuelta en la lista de Clientes y es la
 * misma trampa aquí, donde además el tablero puede quedarse con una columna
 * entera vacía.
 *
 * Quién pasa y quién no lo decide `pasaElFiltro` en `lib/vencimiento.ts`, que es
 * puro y lo comparte con el distintivo: así una tarjeta no puede quedarse fuera
 * de «solo vencidas» estando pintada en rojo.
 */
export function FiltroDeVencimiento({
    valor,
    onCambio,
    className,
}: {
    valor: FiltroDeVencimiento;
    onCambio: (valor: string) => void;
    className?: string;
}) {
    const puesto = valor !== "todas";

    return (
        <Select value={valor} onValueChange={onCambio}>
            <SelectTrigger
                className={cn(
                    "h-8 w-[10.5rem] gap-1.5 text-xs",
                    puesto && "border-primary text-primary",
                    className,
                )}
                title="Filtrar por vencimiento"
                aria-label="Filtrar por vencimiento"
            >
                <Filter className={cn("h-3.5 w-3.5 shrink-0", puesto ? "text-primary" : "text-muted-foreground")} />
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {FILTROS_DE_VENCIMIENTO.map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">
                        {ETIQUETAS_DE_FILTRO[f]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
