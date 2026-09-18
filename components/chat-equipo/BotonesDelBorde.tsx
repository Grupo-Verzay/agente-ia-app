"use client";

import { useState } from "react";
import { MessagesSquare, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { ChatLauncher } from "@/app/(root)/ai-chat/components/ChatLauncher";
import { ChatSheet } from "@/app/(root)/ai-chat/components/ChatSheet";
import { PanelDeEquipo } from "@/components/chat-equipo/PanelDeEquipo";
import { useSinLeerDelEquipo } from "@/hooks/useSinLeerDelEquipo";

/**
 * Los dos botones del borde derecho, como PAREJA.
 *
 * # Por qué están juntos y no cada uno por su lado
 *
 * El del copiloto estaba en `right-0 top-1/2 -translate-y-1/2`: pegado al borde
 * y a media altura. Poniendo el segundo por su cuenta habría que repetir ese
 * cálculo en dos sitios, y el día que uno se mueva el otro se queda —que es
 * como se acaba con dos botones descuadrados—.
 *
 * Así que **la posición se calcula una vez**, aquí: esta columna es la que va
 * centrada en esa misma línea, y dentro caen los dos pegados, el copiloto
 * encima y el del equipo debajo. Cada botón conserva su forma (36 px, media
 * luna contra el borde); lo único que pierden es decidir dónde se ponen.
 *
 * `ChatLauncher` ya aceptaba `className`, y `cn` es `tailwind-merge`: las
 * clases de posición que trae de fábrica las gana la que se le pasa, así que no
 * hay que tocarlo.
 *
 * # Y no tapa la caja de escribir de Chats
 *
 * La pareja mide 76 px de alto centrados en la mitad de la ventana, así que su
 * borde de abajo cae en `50vh + 38px`. La caja de escribir de Chats está pegada
 * al fondo: a 1280×800 son 400 px de separación, y en un móvil de 667 px de
 * alto siguen quedando más de 250. El botón de arriba era ya de 36 px por el
 * mismo motivo —tapaba los tres puntos de las filas—, y esa medida se respeta.
 */
export function BotonesDelBorde() {
    const copilotoAbierto = useChatStore((s) => s.isOpen);
    const abrirCopiloto = useChatStore((s) => s.setOpen);
    const [equipoAbierto, setEquipoAbierto] = useState(false);
    // El contador corre SIEMPRE, también con el panel cerrado: de eso va. El
    // reloj del hilo es el contrario —solo con el panel abierto— porque esto
    // cuelga del layout y aquel se trae los mensajes.
    // Y este mismo reloj es el que suena: lo que trae la vuelta ya dice qué
    // merece sonar y si esta persona lo quiere. Un segundo reloj para el sonido
    // sería preguntar dos veces lo mismo en todas las pantallas de la App.
    const { total: sinLeer, sonido } = useSinLeerDelEquipo();

    // Nunca los dos a la vez: son dos paneles en el mismo sitio, y abiertos a
    // la vez uno taparía al otro sin decir cuál está delante.
    const alternarEquipo = () => {
        setEquipoAbierto((antes) => {
            if (!antes) abrirCopiloto(false);
            return !antes;
        });
    };
    const alternarCopiloto = (v: boolean) => {
        if (v) setEquipoAbierto(false);
        abrirCopiloto(v);
    };

    return (
        <>
            <div className="fixed right-0 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-end gap-1">
                <ChatLauncher
                    open={copilotoAbierto}
                    onOpenChange={alternarCopiloto}
                    // Le quitamos SU posición: la pone la columna.
                    className="static right-auto top-auto translate-y-0 max-sm:static max-sm:right-auto max-sm:top-auto max-sm:translate-y-0"
                />
                <button
                    type="button"
                    onClick={alternarEquipo}
                    aria-label={equipoAbierto ? "Cerrar chat del equipo" : "Abrir chat del equipo"}
                    aria-controls="chat-equipo-escritorio"
                    aria-expanded={equipoAbierto}
                    className={cn(
                        // La misma anatomía que el del copiloto: 36 px y media
                        // luna contra el borde. Si uno cambia, cambian los dos.
                        "group relative flex h-9 w-9 items-center justify-center rounded-l-full border border-r-0 border-primary/25 bg-background text-primary shadow-lg shadow-black/10 transition-all hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        equipoAbierto && "bg-primary text-primary-foreground",
                    )}
                >
                    {equipoAbierto ? (
                        <X className="h-4 w-4" />
                    ) : (
                        <MessagesSquare className="h-4 w-4" />
                    )}
                    {/* El número va FUERA del botón en el flujo —`absolute`—
                        para no empujar su icono: el botón mide 36 px y es la
                        mitad de una pareja alineada, así que crecer lo
                        descuadraría. Se esconde con el panel abierto, donde ya
                        está bajando a cero. */}
                    {!equipoAbierto && sinLeer > 0 && (
                        <span
                            aria-hidden
                            className="pointer-events-none absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground shadow"
                        >
                            {sinLeer > 99 ? "99+" : sinLeer}
                        </span>
                    )}
                    <span className="sr-only">
                        {equipoAbierto
                            ? "Cerrar chat del equipo"
                            : sinLeer > 0
                              ? `Abrir chat del equipo, ${sinLeer} sin leer`
                              : "Abrir chat del equipo"}
                    </span>
                </button>
            </div>

            <ChatSheet open={copilotoAbierto} onOpenChange={alternarCopiloto} />
            <PanelDeEquipo
                abierto={equipoAbierto}
                sonido={sonido}
                onCerrar={() => setEquipoAbierto(false)}
            />
        </>
    );
}
