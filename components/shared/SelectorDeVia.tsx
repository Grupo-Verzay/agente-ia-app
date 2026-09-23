"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * El «Vía:» de una ventana que envía o llama: por dónde sale.
 *
 * Nació dentro de «Nuevo mensaje» de Chats (elegir la LÍNEA) y lo usa también
 * el diálogo de Llamar de CRM › Llamadas (elegir la CUENTA). Es el mismo mando
 * en los dos sitios a propósito: con dos copias, el día que se afine uno el
 * otro se queda atrás y las dos ventanas dejan de parecerse.
 *
 * Con una sola opción no hay nada que elegir y se pinta el texto a secas. Una
 * opción `deshabilitada` se enseña —con su motivo— pero no se puede elegir:
 * esconderla haría pensar que la cuenta no existe.
 */
export type OpcionDeVia = {
    id: string;
    etiqueta: string;
    deshabilitada?: boolean;
    motivo?: string | null;
};

export function SelectorDeVia({
    opciones,
    valor,
    alCambiar,
    vacio = "Seleccionar",
}: {
    opciones: OpcionDeVia[];
    valor: string;
    alCambiar: (id: string) => void;
    vacio?: string;
}) {
    const [abierto, setAbierto] = React.useState(false);
    const elegida = opciones.find((o) => o.id === valor);
    const etiqueta = elegida?.etiqueta ?? vacio;

    if (opciones.length === 0) return null;

    return (
        <div data-selector="via" className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-sm text-muted-foreground">Vía:</span>
            {opciones.length === 1 ? (
                <span className="truncate text-sm text-muted-foreground">{etiqueta}</span>
            ) : (
                <Popover open={abierto} onOpenChange={setAbierto}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            data-boton="via"
                            className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <span className="truncate">{etiqueta}</span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1" align="start">
                        {opciones.map((op, idx) => {
                            const activa = op.id === valor;
                            return (
                                <button
                                    key={op.id}
                                    type="button"
                                    data-opcion-via={op.id}
                                    disabled={op.deshabilitada}
                                    title={op.motivo ?? undefined}
                                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${activa ? "bg-accent/60 font-medium" : ""}`}
                                    onClick={() => {
                                        alCambiar(op.id);
                                        setAbierto(false);
                                    }}
                                >
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                                        {idx + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">{op.etiqueta}</span>
                                        {op.deshabilitada && op.motivo && (
                                            <span className="block truncate text-xs text-muted-foreground">{op.motivo}</span>
                                        )}
                                    </span>
                                    {activa && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                                </button>
                            );
                        })}
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
