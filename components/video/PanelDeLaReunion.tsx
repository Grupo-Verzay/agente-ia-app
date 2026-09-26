"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hand, MicOff, PanelRightClose, Send, UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TOPE_DEL_MENSAJE, comoSeGuardaElMensaje } from "@/lib/sala-de-video";
import { escribirEnLaReunionAction, type MensajeDeLaSala } from "@/actions/salas-de-video-actions";
import { losMandosDeModeracion } from "@/lib/moderar-en-la-sala";
import type { QueSeModera } from "@/hooks/useModerarEnLaSala";

/**
 * El panel de al lado: el chat de la reunión y la lista de gente.
 *
 * Los dos en un solo panel con dos pestañas, y no dos paneles: el sitio que hay
 * a la derecha de una reunión es uno, y con dos paneles que se abren por
 * separado harían falta reglas sobre cuál tapa a cuál. Con pestañas, lo que se
 * elige es qué se mira.
 *
 * # El chat NO sale de la sala
 *
 * No es el chat del equipo con otro nombre: no hay canal, no hay menciones, no
 * hay avisos, no suena nada y no aparece en ninguna otra pantalla. Lo que se
 * escribe aquí lo leen los que están en esta reunión, y se va con ella — la
 * tabla se vacía al revocar el enlace y se barre cuando la reunión termina.
 *
 * Eso es lo que lo hace utilizable para lo que se usa un chat de reunión: pegar
 * una dirección, un número de pedido, un «te llamo luego». Si eso acabara en el
 * hilo del equipo, nadie lo escribiría.
 *
 * # Y no trae ningún reloj propio
 *
 * Los mensajes llegan **dentro de la vuelta del reloj de la sala**, que ya está
 * pagada. Un sondeo propio para el chat sería duplicar las peticiones de la
 * pantalla más cara que tiene esto para traer, el 99 % de las veces, nada.
 */

export type QuienEnElPanel = {
    id: string;
    nombre: string;
    esInvitado: boolean;
    esElAnfitrion: boolean;
    micEncendido: boolean;
    manoLevantada: boolean;
    /** Yo mismo: no me puedo silenciar ni sacar con estos botones. */
    soyYo: boolean;
};

export function PanelDeLaReunion({
    codigo,
    token,
    mensajes,
    gente,
    moderas,
    moderar,
    ocupadoCon,
    miId,
    alCerrar,
    pestana,
    onPestana,
}: {
    codigo: string;
    token?: string | null;
    mensajes: MensajeDeLaSala[];
    gente: QuienEnElPanel[];
    /** Si puedo silenciar y sacar. Lo dice el servidor, no se calcula aquí. */
    moderas: boolean;
    /**
     * Moderar, por el MISMO camino que el menú del recuadro.
     *
     * Llega de fuera y no se monta aquí: con un `useModerarEnLaSala` propio
     * serían dos estados de «hay algo en vuelo», y moderar desde el recuadro
     * dejaría los botones de esta lista encendidos sobre alguien a quien ya se
     * está sacando — o sea, un segundo clic que manda la misma orden otra vez.
     */
    moderar: (que: QueSeModera, quien: { id: string; nombre: string }) => void;
    /** Sobre quién hay algo en vuelo, por su id. */
    ocupadoCon: string | null;
    miId: string | null;
    /** Plegarlo: el video recupera el ancho y se recuerda que quedó plegado. */
    alCerrar: () => void;
    pestana: "chat" | "gente";
    onPestana: (p: "chat" | "gente") => void;
}) {
    return (
        <div className="flex h-full w-full min-w-0 flex-col border-zinc-800 bg-zinc-900 sm:border-l">
            <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
                <Pestana activa={pestana === "chat"} onClick={() => onPestana("chat")}>
                    Chat
                </Pestana>
                <Pestana activa={pestana === "gente"} onClick={() => onPestana("gente")}>
                    Gente ({gente.length})
                </Pestana>
                {/* Una flecha y no una equis: lo que hace es **plegarlo**
                    —devolverle el ancho al video— y no cerrar nada. Con la
                    equis se lee como «descartar», y entonces nadie la pulsa por
                    miedo a perder lo que se ha escrito en el chat. Lo que se
                    escribió sigue ahí al volver a abrirlo. */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={alCerrar}
                    aria-label="Plegar el panel"
                    title="Plegar"
                >
                    <PanelRightClose className="h-4 w-4" />
                </Button>
            </div>

            {pestana === "chat" ? (
                <ElChat codigo={codigo} token={token} mensajes={mensajes} miId={miId} />
            ) : (
                <LaGente
                    gente={gente}
                    moderas={moderas}
                    moderar={moderar}
                    ocupadoCon={ocupadoCon}
                />
            )}
        </div>
    );
}

function Pestana({
    activa,
    onClick,
    children,
}: {
    activa: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={activa}
            className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                activa
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
            )}
        >
            {children}
        </button>
    );
}

function ElChat({
    codigo,
    token,
    mensajes,
    miId,
}: {
    codigo: string;
    token?: string | null;
    mensajes: MensajeDeLaSala[];
    miId: string | null;
}) {
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const hiloRef = useRef<HTMLDivElement | null>(null);

    /**
     * Bajar al final cuando llega algo.
     *
     * Aquí SÍ se arrastra siempre, al revés que el hilo del chat de equipo, y
     * es a propósito: este chat son cinco mensajes en media hora y se lee de
     * reojo mientras se habla. La regla de «no mover la vista de quien está
     * leyendo arriba» está para hilos de meses; aquí no hay nada arriba que
     * leer, y una flecha de «hay algo nuevo» en un panel de esta anchura sería
     * más ruido que el propio mensaje.
     */
    useEffect(() => {
        const el = hiloRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [mensajes.length]);

    const enviar = useCallback(async () => {
        const limpio = comoSeGuardaElMensaje(texto);
        if (!limpio || enviando) return;
        setEnviando(true);
        // Se vacía la caja YA, antes de que conteste el servidor: un recuadro
        // que se queda con lo escrito mientras se manda se lee como que no se
        // mandó, y la gente lo vuelve a pulsar. Si falla, se devuelve.
        setTexto("");
        try {
            const res = await escribirEnLaReunionAction({ codigo, token, texto: limpio });
            if (!res.success) {
                toast.error(res.message);
                setTexto(limpio);
            }
            // Y no se mete a mano en la lista: lo trae la vuelta del reloj, en
            // dos segundos como mucho. Metiéndolo aquí saldría dos veces —una
            // nuestra y otra del servidor— o habría que deduplicar en dos
            // sitios.
        } catch (error) {
            console.warn("[sala] no se pudo enviar el mensaje", error);
            toast.error("No se pudo enviar el mensaje.");
            setTexto(limpio);
        } finally {
            setEnviando(false);
        }
    }, [codigo, enviando, texto, token]);

    return (
        <>
            <div ref={hiloRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {mensajes.length ? (
                    mensajes.map((m) => (
                        <div key={m.id} className={cn("flex flex-col", m.deId === miId && "items-end")}>
                            <span className="px-1 text-[10px] text-zinc-500">
                                {m.deId === miId ? "Tú" : m.autorNombre}
                            </span>
                            <span
                                className={cn(
                                    // `break-words` y `whitespace-pre-wrap`: se
                                    // pegan direcciones largas sin espacios, y
                                    // sin esto se salen del panel.
                                    "max-w-full whitespace-pre-wrap break-words rounded-lg px-2 py-1 text-xs",
                                    m.deId === miId
                                        ? "bg-sky-600 text-white"
                                        : "bg-zinc-800 text-zinc-100",
                                )}
                            >
                                {m.texto}
                            </span>
                        </div>
                    ))
                ) : (
                    <p className="px-1 py-6 text-center text-xs text-zinc-500">
                        Lo que se escriba aquí se queda en esta reunión.
                    </p>
                )}
            </div>
            <div className="flex shrink-0 items-end gap-1.5 border-t border-zinc-800 p-2">
                <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter manda, Mayús+Enter salta de línea. Es lo que
                        // hace todo chat, y aquí importa más que en un
                        // formulario: se escribe con prisa y mirando a otro
                        // sitio.
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void enviar();
                        }
                    }}
                    placeholder="Escribe aquí…"
                    maxLength={TOPE_DEL_MENSAJE}
                    rows={1}
                    className="max-h-24 min-h-[2.25rem] flex-1 resize-none border-zinc-700 bg-zinc-950 text-xs text-zinc-100 placeholder:text-zinc-500"
                />
                <Button
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => void enviar()}
                    disabled={enviando || !texto.trim()}
                    aria-label="Enviar el mensaje"
                    title="Enviar"
                >
                    <Send className="h-4 w-4" />
                </Button>
            </div>
        </>
    );
}

function LaGente({
    gente,
    moderas,
    moderar,
    ocupadoCon,
}: {
    gente: QuienEnElPanel[];
    moderas: boolean;
    moderar: (que: QueSeModera, quien: { id: string; nombre: string }) => void;
    /** El id, no un booleano: apagar por persona y no la lista entera. */
    ocupadoCon: string | null;
}) {
    return (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {gente.map((q) => (
                <FilaDeGente
                    key={q.id}
                    quien={q}
                    moderas={moderas}
                    moderar={moderar}
                    ocupado={ocupadoCon === q.id}
                />
            ))}
            {!moderas ? (
                <p className="px-1 pt-3 text-[11px] leading-relaxed text-zinc-500">
                    Silenciar y sacar a alguien solo lo puede quien organiza la reunión.
                </p>
            ) : null}
        </div>
    );
}

function FilaDeGente({
    quien,
    moderas,
    moderar,
    ocupado,
}: {
    quien: QuienEnElPanel;
    moderas: boolean;
    moderar: (que: QueSeModera, quien: { id: string; nombre: string }) => void;
    ocupado: boolean;
}) {
    // La MISMA decisión que pinta el menú del recuadro. Escrita otra vez aquí
    // —«moderas && !soyYo && micEncendido»— serían dos, y el día que se afine
    // una este sitio ofrecería otra cosa que el otro.
    const mandos = losMandosDeModeracion({
        moderas,
        soyYo: quien.soyYo,
        micEncendido: quien.micEncendido,
        nombre: quien.nombre,
    });

    return (
        <div className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-800/60">
            {quien.manoLevantada ? (
                <Hand className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Mano levantada" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                {quien.nombre}
                {quien.soyYo ? <span className="text-zinc-500"> (tú)</span> : null}
                {quien.esElAnfitrion ? (
                    <span className="text-zinc-500"> · anfitrión</span>
                ) : quien.esInvitado ? (
                    <span className="text-zinc-500"> · invitado</span>
                ) : null}
            </span>
            {!quien.micEncendido ? (
                <MicOff className="h-3.5 w-3.5 shrink-0 text-red-300" aria-label="Con el micrófono apagado" />
            ) : null}
            {/* Los botones solo para quien modera Y sobre otra persona. Sobre
                uno mismo no se pintan: silenciarse tiene su propio botón —y ese
                sí apaga la pista de verdad— y sacarse a uno mismo es colgar.
                Lo decide `losMandosDeModeracion`, no una condición de aquí. */}
            {mandos.hayMenu ? (
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                        onClick={() => moderar("silenciar", quien)}
                        disabled={ocupado || !mandos.silenciar.puede}
                        // Y se dice POR QUÉ está apagado: un botón gris sin
                        // explicación se lee como que la App está rota.
                        title={mandos.silenciar.porQue}
                        aria-label={mandos.silenciar.porQue}
                    >
                        <MicOff className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-zinc-400 hover:bg-red-600 hover:text-white"
                        onClick={() => moderar("sacar", quien)}
                        disabled={ocupado || !mandos.sacar.puede}
                        title={mandos.sacar.porQue}
                        aria-label={mandos.sacar.porQue}
                    >
                        <UserX className="h-3.5 w-3.5" />
                    </Button>
                </>
            ) : null}
        </div>
    );
}
