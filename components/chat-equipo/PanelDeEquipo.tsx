"use client";

import { useEffect } from "react";
import { Users, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    FRANJA_LATERAL,
    FRANJA_LATERAL_MOVIL,
    HOJA_LATERAL,
    HOJA_LATERAL_MOVIL,
    avisarDelPanelLateral,
} from "@/lib/panel-lateral";
import { HiloDelEquipo } from "@/components/chat-equipo/HiloDelEquipo";

/**
 * El chat del equipo, **encima de donde estés**.
 *
 * # Por qué un panel y no solo una ruta
 *
 * Porque el equipo vive en Chats y no va a salir de ahí para hablar. Una ruta
 * obliga a irse de la pantalla en la que se está trabajando, y eso es
 * exactamente lo que hace que no se use — la misma razón por la que la
 * campanita se ignoraba.
 *
 * La ruta `/chat-equipo` **se queda**: es la misma pantalla, montada como
 * módulo para quien la quiera en el menú. Las dos pintan `HiloDelEquipo`, así
 * que no hay dos sitios que mantener a la par.
 *
 * # La forma la pone `lib/panel-lateral`
 *
 * El ancho, dónde arranca y hasta dónde baja no se escriben aquí: son las
 * mismas clases que usa el copiloto, y las dos medidas salen de CSS
 * (`--ancho-lateral`, `--alto-de-la-barra`). Copiadas, el día que se afine una
 * el otro panel se queda atrás y los dos dejan de parecer del mismo sitio.
 *
 * # Y la carga es PEREZOSA
 *
 * El hilo no se pide hasta que alguien abre el panel — lo decide `activo`
 * dentro de `HiloDelEquipo`. Esto cuelga del layout, o sea de **todas** las
 * pantallas de la App: pedirlo al montar sería una consulta más en cada carga
 * de Chats, de Analíticas y de todo lo demás, para algo que la mayoría de las
 * veces no se abre.
 */
export function PanelDeEquipo({
    abierto,
    onCerrar,
}: {
    abierto: boolean;
    onCerrar: () => void;
}) {
    // Chats acomoda la conversación mientras haya un panel abierto, igual que
    // ya hace con la ficha de Contacto. En el resto de la plataforma esto no
    // hace nada: la regla de CSS está acotada a `[data-chat-view]`.
    useEffect(() => {
        avisarDelPanelLateral(abierto);
        return () => avisarDelPanelLateral(false);
    }, [abierto]);

    return (
        <>
            <div className={FRANJA_LATERAL}>
                <Marco abierto={abierto} onCerrar={onCerrar} />
            </div>
            <div className={FRANJA_LATERAL_MOVIL}>
                <Marco movil abierto={abierto} onCerrar={onCerrar} />
            </div>
        </>
    );
}

function Marco({
    abierto,
    onCerrar,
    movil = false,
}: {
    abierto: boolean;
    onCerrar: () => void;
    movil?: boolean;
}) {
    return (
        <section
            id={movil ? "chat-equipo-movil" : "chat-equipo-escritorio"}
            aria-label="Chat del equipo"
            aria-hidden={!abierto}
            className={cn(
                movil ? HOJA_LATERAL_MOVIL : HOJA_LATERAL,
                abierto ? "translate-x-0" : "translate-x-full",
            )}
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Users className="h-4 w-4" />
                    </span>
                    <h2 className="truncate text-base font-semibold">Chat del equipo</h2>
                </div>
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Cerrar chat del equipo"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    <X className="h-4 w-4" />
                </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
                {/* El reloj y la carga solo corren con el panel abierto: con él
                    cerrado no hay nadie mirando, y esto cuelga de TODAS las
                    pantallas. */}
                <HiloDelEquipo activo={abierto} />
            </div>
        </section>
    );
}
