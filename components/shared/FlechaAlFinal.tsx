"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * La flecha de bajar al final de un hilo, con su contador.
 *
 * Aparece sola al alejarse del final y se va al volver abajo. Si mientras tanto
 * entran mensajes, los cuenta: es la única señal de que ha llegado algo cuando
 * se está leyendo arriba, porque **la vista ya no se arrastra sola** — que es
 * justo lo que se pidió.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Va dentro del contenedor del hilo**, que tiene que ser `relative`. Suelta
 *    en la pantalla se colocaría respecto a la ventana y acabaría encima de la
 *    caja de escribir o del menú lateral, según la pantalla.
 * 2. **No se desmonta: se esconde.** Con `opacity` y `pointer-events`, para que
 *    aparecer y desaparecer no empuje nada y no cueste un montaje por cada
 *    vuelta del reloj. Y con `aria-hidden` cuando no está, para que un lector
 *    de pantalla no ofrezca un botón invisible.
 * 3. **El contador se recorta a «+99».** Un chat de grupo que lleva toda la
 *    mañana puede tener cientos, y un número de cuatro cifras deforma el botón.
 */
export function FlechaAlFinal({
    visible,
    sinLeer,
    onClick,
    className,
}: {
    visible: boolean;
    sinLeer: number;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            aria-label={
                sinLeer > 0
                    ? `Bajar al final, ${sinLeer} sin leer`
                    : "Bajar al final del historial"
            }
            className={cn(
                "absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center",
                "rounded-full border border-border bg-background text-foreground shadow-lg",
                "transition-opacity hover:bg-muted",
                visible ? "opacity-100" : "pointer-events-none opacity-0",
                className,
            )}
        >
            <ChevronDown className="h-5 w-5" />
            {sinLeer > 0 ? (
                // Fuera del flujo: el botón mide 40 px y es redondo, así que un
                // contador dentro lo deformaría. Y `min-w` con `px` en vez de un
                // ancho fijo, para que «+99» quepa sin recortarse.
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground">
                    {sinLeer > 99 ? "+99" : sinLeer}
                </span>
            ) : null}
        </button>
    );
}
