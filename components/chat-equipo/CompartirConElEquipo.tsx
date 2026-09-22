"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, Loader2, MessagesSquare, Share2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PanelLateral } from "@/components/shared/PanelLateral";
import { PANEL_DE_ENVIAR_AL_EQUIPO } from "@/lib/panel-lateral";
import { Textarea } from "@/components/ui/textarea";
import { TOPE_DEL_CONTEXTO, type ChatCompartido } from "@/lib/chat-compartido";
import {
    canalesParaCompartirAction,
    enviarAlEquipoAction,
} from "@/actions/chat-de-equipo-actions";

/**
 * Mandar la conversación abierta al chat del equipo.
 *
 * # Para qué
 *
 * Hasta ahora, para que el equipo viera un caso de WhatsApp, el asesor copiaba
 * el texto a mano y lo explicaba. Esto publica en un canal un mensaje con el
 * nombre del contacto, su número y un enlace que abre **esa misma
 * conversación** — quien lo pulse cae dentro, sin buscarla.
 *
 * # Tres cosas que hay que mantener
 *
 * 1. **Los canales se piden al ABRIR el diálogo, no antes.** Esto cuelga de la
 *    cabecera de Chats, que es de las pantallas más caras de la App: una
 *    consulta más en cada carga, para un diálogo que casi nunca se abre, es
 *    justo lo que este proyecto llama «esperar turno en vez de trabajar».
 * 2. **Solo se ofrecen los canales donde se puede ESCRIBIR**, y lo decide el
 *    servidor. Un administrador lee los directos de su cuenta y no escribe en
 *    ellos, así que ofrecérselos sería ofrecer un destino que la acción luego
 *    rechaza — un botón que al pulsarlo da error es peor que no tenerlo.
 * 3. **El botón dice que se pulsó antes de que el servidor conteste**, y la
 *    segunda pulsación no hace nada. Es la regla del botón «Salir».
 *
 * # Y es un PANEL LATERAL, no un diálogo
 *
 * Era un modal centrado con velo. Se abre desde la cabecera de Chats como la
 * ficha, el recordatorio y la tarea, así que va por el mismo sitio —la franja
 * de la derecha— y entra en la misma exclusión: abrirlo cierra el panel que
 * hubiera, y abrir otro lo cierra a él.
 */
export function CompartirConElEquipo({
    abierto,
    onCerrar,
    chat,
}: {
    abierto: boolean;
    onCerrar: () => void;
    chat: ChatCompartido;
}) {
    const [canales, setCanales] = useState<
        { id: string; nombre: string; tipo: string }[] | null
    >(null);
    const [elegido, setElegido] = useState<string>("");
    const [contexto, setContexto] = useState("");
    const [enviando, setEnviando] = useState(false);

    const cerrar = useCallback(() => {
        if (enviando) return;
        setContexto("");
        onCerrar();
    }, [enviando, onCerrar]);

    useEffect(() => {
        if (!abierto || canales) return;
        let vivo = true;
        void (async () => {
            try {
                const res = await canalesParaCompartirAction();
                if (!vivo) return;
                if (!res.success) {
                    // Un desplegable vacío se lee como «no tengo canales», no
                    // como un fallo. Hay que decirlo.
                    toast.error(res.message);
                    setCanales([]);
                    return;
                }
                setCanales(res.data.canales);
                setElegido((antes) => antes || res.data.canales[0]?.id || "");
            } catch (error) {
                console.warn("[chats] no se pudieron leer los canales del equipo", error);
                toast.error("No se pudieron cargar los canales.");
                if (vivo) setCanales([]);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [abierto, canales]);

    const enviar = async () => {
        if (enviando || !elegido) return;
        setEnviando(true);
        try {
            // El contexto es la línea que escribe el asesor. Va como el texto
            // del mensaje; la conversación va aparte, como dato, para que el
            // otro lado pueda comprobar el acceso antes de pintar el botón.
            const texto =
                contexto.trim() ||
                `Mira esta conversación de ${chat.nombre?.trim() || chat.jid}.`;
            const res = await enviarAlEquipoAction(texto, elegido, chat);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            toast.success("Enviado al equipo.");
            setContexto("");
            onCerrar();
        } catch (error) {
            // Una acción puede REVENTAR, no solo devolver `success: false`, y
            // entonces el «Enviando…» no se apagaría nunca.
            console.warn("[chats] no se pudo compartir con el equipo", error);
            toast.error("No se pudo enviar. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <PanelLateral
            id={PANEL_DE_ENVIAR_AL_EQUIPO}
            abierto={abierto}
            onCerrar={cerrar}
            titulo="Enviar al equipo"
            subtitulo={chat.nombre?.trim() || chat.jid}
            icono={<Share2 className="h-4 w-4" />}
        >
            <div className="space-y-4 px-4 py-4">
                <p className="text-sm text-muted-foreground">
                    Se publica en el canal que elijas, con un enlace que abre esta
                    conversación.
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                            {chat.nombre?.trim() || chat.jid}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                            {[chat.numero, chat.linea].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Canal
                    </label>
                    {canales === null ? (
                        <p className="py-1 text-sm text-muted-foreground">Cargando…</p>
                    ) : canales.length === 0 ? (
                        <p className="py-1 text-sm text-muted-foreground">
                            No hay ningún canal donde puedas escribir.
                        </p>
                    ) : (
                        // Su propio scroll: la lista crece con los canales de la
                        // cuenta, y sin tope el diálogo se estira sin fin.
                        <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
                            {canales.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setElegido(c.id)}
                                    className={[
                                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                                        c.id === elegido
                                            ? "bg-primary/10 text-primary"
                                            : "hover:bg-muted/60",
                                    ].join(" ")}
                                >
                                    {c.tipo === "directo" ? (
                                        <Users className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                        <Hash className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <span className="min-w-0 truncate">{c.nombre}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Contexto
                    </label>
                    <Textarea
                        value={contexto}
                        onChange={(e) =>
                            setContexto(e.target.value.slice(0, TOPE_DEL_CONTEXTO))
                        }
                        rows={2}
                        placeholder="Qué pasa con este cliente…"
                        className="min-h-[60px] resize-y"
                        disabled={enviando}
                    />
                </div>

            </div>

            {/* Cancelar a la izquierda y la acción a la derecha, los dos como
                hijos DIRECTOS de la fila: es lo que hace que `justify-between`
                los reparta. Mismo pie que el recordatorio y la tarea. */}
            <div className="mt-auto flex flex-row flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
                <Button variant="ghost" onClick={cerrar} disabled={enviando}>
                    Cancelar
                </Button>
                <Button
                    onClick={() => void enviar()}
                    disabled={enviando || !elegido || !canales?.length}
                >
                    {enviando ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando…
                        </>
                    ) : (
                        "Enviar"
                    )}
                </Button>
            </div>
        </PanelLateral>
    );
}
