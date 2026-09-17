"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessagesSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    CADA_CUANTO_MS,
    TOPE_DEL_MENSAJE,
    comoSeLlama,
    type MensajeDeEquipo,
    type PersonaMencionable,
} from "@/lib/chat-de-equipo";
import {
    enviarAlEquipoAction,
    hiloDelEquipoAction,
} from "@/actions/chat-de-equipo-actions";

/**
 * El hilo del equipo.
 *
 * Lo pintan **los dos sitios**: el panel lateral —que es por donde se usa— y la
 * ruta `/chat-equipo`, para quien la quiera montar como módulo. Con dos copias,
 * el día que se afine algo se afina en una y la otra se queda atrás, y eso no
 * se ve como un error sino como «a veces funciona».
 *
 * # El reloj responde
 *
 * Un `setInterval` montado **una sola vez** que lee todo por referencia. No se
 * vuelve a una cadena de `setTimeout`: si una vuelta no llega a programar la
 * siguiente, el ciclo muere en silencio y el hilo se congela hasta recargar —
 * es la primera regla de Chats de este proyecto, y aquí no hay tiempo real que
 * lo tape.
 *
 * Con la pestaña de fondo no se pregunta —nadie está mirando— y al volver a
 * ella se pregunta de inmediato.
 *
 * # Y un fallo del reloj no puede ser mudo
 *
 * El `catch` del ciclo escribe. Un refresco que falla en silencio no se nota
 * como un error: se nota como un chat que no trae los mensajes de los demás,
 * que es mucho peor de diagnosticar.
 */
export function HiloDelEquipo({
    inicial,
    yo,
    equipo,
    activo = true,
}: {
    inicial: MensajeDeEquipo[];
    yo: string;
    equipo: PersonaMencionable[];
    /**
     * Si el reloj tiene que correr.
     *
     * En la ruta siempre; en el panel, solo con el panel abierto. Esto cuelga
     * del layout, o sea de TODAS las pantallas: un sondeo corriendo con el
     * panel cerrado sería una consulta cada cinco segundos por pestaña para
     * algo que nadie está mirando.
     */
    activo?: boolean;
}) {
    const [mensajes, setMensajes] = useState<MensajeDeEquipo[]>(inicial);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);

    // Lo que el ciclo necesita mirar sin volver a montarse.
    const abajoDelTodo = useRef<HTMLDivElement | null>(null);
    const caja = useRef<HTMLTextAreaElement | null>(null);

    // ── El reloj ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo) return;
        let vivo = true;

        const traer = async () => {
            if (document.visibilityState === "hidden") return;
            try {
                const res = await hiloDelEquipoAction();
                if (!vivo) return;
                if (!res.success) {
                    console.warn("[chat-equipo] el refresco no trajo nada", res.message);
                    return;
                }
                setMensajes(res.data.mensajes);
            } catch (error) {
                console.warn("[chat-equipo] falló una vuelta del refresco", error);
            }
        };

        const id = setInterval(traer, CADA_CUANTO_MS);
        // Al volver a la pestaña se pregunta ya, sin esperar a la vuelta.
        const alVolver = () => {
            if (document.visibilityState === "visible") void traer();
        };
        document.addEventListener("visibilitychange", alVolver);

        return () => {
            vivo = false;
            clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [activo]);

    // Pegado abajo: un chat se lee por el final.
    useEffect(() => {
        abajoDelTodo.current?.scrollIntoView({ block: "end" });
    }, [mensajes.length]);

    const enviar = useCallback(async () => {
        const limpio = texto.trim();
        if (!limpio || enviando) return;
        setEnviando(true);
        try {
            const res = await enviarAlEquipoAction(limpio);
            if (!res.success) {
                // Un botón que no dice por qué no hizo nada es un botón que se
                // pulsa cinco veces.
                toast.error(res.message);
                return;
            }
            setTexto("");
            // Se pinta al momento y el reloj lo confirma en su vuelta: el
            // servidor manda, pero escribir no puede sentirse lento.
            setMensajes((antes) =>
                antes.some((m) => m.id === res.data.id) ? antes : [...antes, res.data],
            );
        } catch (error) {
            console.error("[chat-equipo] el envío reventó", error);
            toast.error("No se pudo enviar. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    }, [texto, enviando]);

    /** Enter envía, Mayús+Enter hace salto de línea. */
    const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void enviar();
        }
    };

    const nombrePorId = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of equipo) m.set(p.id, comoSeLlama(p));
        return m;
    }, [equipo]);

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:px-6">
                {mensajes.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        <MessagesSquare className="h-8 w-8 opacity-40" />
                        <p>Aquí habla el equipo de esta cuenta.</p>
                        <p className="text-xs">
                            Escribe <span className="font-medium">@</span> y el nombre de
                            alguien para avisarle.
                        </p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-3xl flex-col gap-3">
                        {mensajes.map((m) => (
                            <Burbuja
                                key={m.id}
                                mensaje={m}
                                mio={m.autorId === yo}
                                meMencionan={m.mencionados.includes(yo)}
                                nombrePorId={nombrePorId}
                            />
                        ))}
                        <div ref={abajoDelTodo} />
                    </div>
                )}
            </div>

            <div className="shrink-0 border-t border-border bg-background px-3 py-3 sm:px-6">
                <div className="mx-auto flex max-w-3xl items-end gap-2">
                    <Textarea
                        ref={caja}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value.slice(0, TOPE_DEL_MENSAJE))}
                        onKeyDown={alTeclear}
                        rows={1}
                        placeholder="Escribe al equipo…  (@ para mencionar)"
                        className="max-h-40 min-h-[40px] flex-1 resize-y"
                        disabled={enviando}
                    />
                    <Button
                        onClick={() => void enviar()}
                        disabled={enviando || !texto.trim()}
                        className="shrink-0"
                    >
                        {enviando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Enviar</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function Burbuja({
    mensaje,
    mio,
    meMencionan,
    nombrePorId,
}: {
    mensaje: MensajeDeEquipo;
    mio: boolean;
    meMencionan: boolean;
    nombrePorId: Map<string, string>;
}) {
    const quien = mensaje.autorNombre?.trim() || nombrePorId.get(mensaje.autorId) || "Alguien";
    const hora = new Date(mensaje.creadoEn).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div className={`flex flex-col gap-1 ${mio ? "items-end" : "items-start"}`}>
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{mio ? "Tú" : quien}</span>
                <span>{hora}</span>
            </div>
            <div
                className={[
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm",
                    mio
                        ? "border-primary/30 bg-primary/10"
                        : "border-border bg-muted/40",
                    // Una mención se ve sin leer el texto: es lo que hace que
                    // volver al hilo desde el aviso valga para algo.
                    meMencionan ? "ring-2 ring-amber-400/60" : "",
                ].join(" ")}
            >
                {mensaje.texto}
            </div>
        </div>
    );
}
