"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { hiloDelEquipoAction } from "@/actions/chat-de-equipo-actions";
import type { MensajeDeEquipo, PersonaMencionable } from "@/lib/chat-de-equipo";
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
 * # Y la carga es PEREZOSA
 *
 * El hilo no se pide hasta que alguien abre el panel. Esto cuelga del layout,
 * o sea de **todas** las pantallas de la App: pedirlo al montar sería una
 * consulta más en cada carga de Chats, de Analíticas y de todo lo demás, para
 * algo que la mayoría de las veces no se abre.
 */
export function PanelDeEquipo({
    abierto,
    onCerrar,
}: {
    abierto: boolean;
    onCerrar: () => void;
}) {
    const [datos, setDatos] = useState<{
        mensajes: MensajeDeEquipo[];
        yo: string;
        equipo: PersonaMencionable[];
    } | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);

    useEffect(() => {
        if (!abierto || datos) return;
        let vivo = true;
        void (async () => {
            try {
                const res = await hiloDelEquipoAction();
                if (!vivo) return;
                if (!res.success) {
                    setFallo(res.message);
                    return;
                }
                setDatos(res.data);
            } catch (error) {
                // Un panel que se abre vacío y no dice por qué se lee como que
                // el chat no funciona.
                console.warn("[chat-equipo] no se pudo abrir el panel", error);
                if (vivo) setFallo("No se pudo cargar el chat del equipo.");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [abierto, datos]);

    return (
        <>
            {/* Escritorio: una franja a la derecha, la misma anchura que el
                copiloto para que los dos se sientan del mismo sitio. */}
            <div className="pointer-events-none fixed right-0 top-0 z-50 hidden h-[100dvh] w-[min(440px,calc(100vw-3.5rem))] sm:block">
                <Marco
                    abierto={abierto}
                    onCerrar={onCerrar}
                    datos={datos}
                    fallo={fallo}
                />
            </div>

            {/* Móvil: la pantalla entera, como el copiloto. */}
            <div className="pointer-events-none fixed inset-0 z-50 sm:hidden">
                <Marco
                    movil
                    abierto={abierto}
                    onCerrar={onCerrar}
                    datos={datos}
                    fallo={fallo}
                />
            </div>
        </>
    );
}

function Marco({
    abierto,
    onCerrar,
    datos,
    fallo,
    movil = false,
}: {
    abierto: boolean;
    onCerrar: () => void;
    datos: {
        mensajes: MensajeDeEquipo[];
        yo: string;
        equipo: PersonaMencionable[];
    } | null;
    fallo: string | null;
    movil?: boolean;
}) {
    return (
        <section
            id={movil ? "chat-equipo-movil" : "chat-equipo-escritorio"}
            aria-label="Chat del equipo"
            aria-hidden={!abierto}
            className={cn(
                "pointer-events-auto flex flex-col overflow-hidden bg-background shadow-2xl shadow-black/10 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)]",
                movil
                    ? "absolute inset-0 h-[100dvh] w-screen border-0 shadow-none"
                    : "absolute right-0 top-0 h-[100dvh] w-full rounded-l-lg border border-r-0",
                abierto ? "translate-x-0" : "translate-x-full",
            )}
        >
            <header
                className={cn(
                    "flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3",
                    movil && "pt-[max(0.75rem,env(safe-area-inset-top))]",
                )}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Users className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold">Chat del equipo</h2>
                        <p className="truncate text-xs text-muted-foreground">
                            Todo el equipo de esta cuenta
                        </p>
                    </div>
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
                {fallo ? (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                        {fallo}
                    </div>
                ) : datos ? (
                    <HiloDelEquipo
                        inicial={datos.mensajes}
                        yo={datos.yo}
                        equipo={datos.equipo}
                        // El reloj solo corre con el panel abierto: con él
                        // cerrado no hay nadie mirando, y esto cuelga de TODAS
                        // las pantallas.
                        activo={abierto}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                        Cargando…
                    </div>
                )}
            </div>
        </section>
    );
}
