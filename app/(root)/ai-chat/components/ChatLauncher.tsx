"use client";

import { Bot, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTON_DEL_BORDE, GLIFO_DEL_BOTON_DEL_BORDE } from "@/lib/botones-del-borde";

/**
 * El botón del copiloto: **el EJE** de la columna del borde derecho.
 *
 * # Ya no trae su posición, y eso es el arreglo
 *
 * Traía `fixed right-0 top-1/2 -translate-y-1/2` de fábrica más su copia para
 * `max-sm:`, y quien lo montaba en la columna se lo tenía que deshacer con
 * `static right-auto top-auto translate-y-0 max-sm:...`. Una clase que se pone
 * para quitarla es una clase que el día que se afine deja de quitarse entera.
 * La posición la pone la columna (`lib/botones-del-borde.ts`), que es la que
 * sabe cuántos botones hay y cuál va centrado.
 *
 * # Y la forma tampoco es suya
 *
 * Los 36 px y la media luna contra el borde estaban escritos aquí y otra vez en
 * el del equipo, con un comentario que decía «si uno cambia, cambian los dos»
 * —que es la forma de reconocer que el día que cambie uno el otro se queda—.
 * Ahora son `BOTON_DEL_BORDE` y los tres la importan.
 *
 * Los 36 y no 48 siguen teniendo su motivo: va pegado al borde y por encima de
 * todo, así que su alto es una franja donde no se puede pulsar lo que haya
 * debajo — tapaba los tres puntos de las filas de Chats.
 */
export const ChatLauncher = ({
    open,
    onOpenChange,
    className,
    controlsId = "ai-chat-sheet-desktop",
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    className?: string;
    controlsId?: string;
}) => {
    return (
        <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? "Cerrar copiloto" : "Abrir copiloto"}
            aria-controls={controlsId}
            aria-expanded={open}
            data-boton-del-borde="copiloto"
            className={cn(
                BOTON_DEL_BORDE,
                open && "bg-primary text-primary-foreground",
                className,
            )}
        >
            {open ? (
                <X className={GLIFO_DEL_BOTON_DEL_BORDE} />
            ) : (
                <Bot className={GLIFO_DEL_BOTON_DEL_BORDE} />
            )}
            <span className="sr-only">{open ? "Cerrar copiloto" : "Abrir copiloto"}</span>
        </button>
    );
};
