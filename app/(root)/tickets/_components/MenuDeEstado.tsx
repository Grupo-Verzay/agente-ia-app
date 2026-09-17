"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
    ESTADOS_DE_TICKET,
    ETIQUETAS_DE_ESTADO,
    type EstadoDeTicket,
} from "@/lib/tickets";

/**
 * Cambiar el estado sin ocupar la fila entera.
 *
 * Antes eran los **cinco estados en botones**, uno al lado del otro, debajo de
 * cada tarjeta. En el tablero sobran —ahí se arrastra— y en la lista se comían
 * el ancho: la fila era la botonera y el ticket, un título encima.
 *
 * Van en un menú de un solo botón. Los cinco caben sin desplazar nada, así que
 * no necesita tope de alto: la lista no crece con la cuenta, son cinco y serán
 * cinco.
 */
export function MenuDeEstado({
    estado,
    moviendo = false,
    onElegir,
}: {
    estado: EstadoDeTicket;
    moviendo?: boolean;
    onElegir: (estado: EstadoDeTicket) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={moviendo}
                    className="h-7 gap-1 px-2 text-xs"
                    title="Cambiar el estado"
                >
                    {moviendo ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mover"}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Mover a
                </DropdownMenuLabel>
                {ESTADOS_DE_TICKET.map((e) => (
                    <DropdownMenuItem
                        key={e}
                        disabled={e === estado}
                        onSelect={() => onElegir(e)}
                        className="text-sm"
                    >
                        <Check className={cn("mr-2 h-3.5 w-3.5", e === estado ? "opacity-100" : "opacity-0")} />
                        {ETIQUETAS_DE_ESTADO[e]}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
