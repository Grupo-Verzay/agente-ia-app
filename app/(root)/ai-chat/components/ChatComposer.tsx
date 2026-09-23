"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mic, SendIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    BOTON_DE_ENVIAR,
    BOTON_REDONDO_GRABANDO,
    FILA_DE_LA_BARRA,
    MARCO_DE_LA_BARRA,
} from "@/lib/barra-de-escribir";
import {
    BotonesDeLaDerecha,
    ZonaDeHerramientas,
    rellenoParaLosBotones,
    useAltoDeLaCaja,
} from "@/components/shared/BarraDeEscribir";
import { OpcionesRapidas } from "./QuickActions";

import { useChatContext } from "../hooks/useChatContext";
import { mergeBufferedUserMessages } from "../helpers/mergeBufferedUserMessages";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { sendChatAction } from "@/actions/ai-chat-actions";
import { useSpeechDictation } from "@/hooks/useSpeechDictation";

const WAIT_MS = 1500;
const AI_DELAY_MS = 700;
const CLIENT_TIMEOUT_MS = 26000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withClientTimeout<T>(promise: Promise<T>, ms = CLIENT_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("client_timeout")), ms);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * La barra de escribir del copiloto: **la misma de la conversación y del chat
 * de equipo**, no una parecida.
 *
 * Tenía tres botones sueltos encima de la caja —«Sugerir respuesta», «Resumir
 * chat», «Seguimiento»— y a la derecha el micrófono Y la flecha a la vez. Ahora
 * las sugerencias viven dentro del «+» de la izquierda (`ZonaDeHerramientas`,
 * siempre plegada: es un panel de 18 a 24 rem) y a la derecha hay UN botón, que
 * decide `losBotonesDeLaDerecha` con `conNota: false`: el micrófono con la caja
 * vacía, la flecha en cuanto hay algo escrito. El marco y la fila son los de
 * las otras dos (`MARCO_DE_LA_BARRA`, `FILA_DE_LA_BARRA`).
 */
export function ChatComposer({ mobile = false }: { mobile?: boolean }) {
    const [text, setText] = useState("");
    const [herramientas, setHerramientas] = useState(false);
    const caja = useRef<HTMLTextAreaElement>(null);
    const zona = useRef<HTMLDivElement>(null);

    useAltoDeLaCaja({ ref: caja, texto: text });

    // La columna del «+» se cierra al pulsar fuera, como en las otras dos.
    useEffect(() => {
        if (!herramientas) return;
        const fuera = (e: MouseEvent) => {
            if (zona.current && !zona.current.contains(e.target as Node)) setHerramientas(false);
        };
        document.addEventListener("mousedown", fuera);
        return () => document.removeEventListener("mousedown", fuera);
    }, [herramientas]);

    const dictation = useSpeechDictation();

    const ctx = useChatContext();

    const addMessage = useChatStore((s) => s.addMessage);
    const enqueueUserMessage = useChatStore((s) => s.enqueueUserMessage);
    const clearBuffer = useChatStore((s) => s.clearBuffer);
    const flushTimer = useChatStore((s) => s.flushTimer);
    const setFlushTimer = useChatStore((s) => s.setFlushTimer);
    const setTyping = useChatStore((s) => s.setTyping);
    const isTyping = useChatStore((s) => s.isTyping);

    const flush = async () => {
        const buffer = useChatStore.getState().buffer;
        if (!buffer.length) return;

        const mergedText = mergeBufferedUserMessages(buffer);
        const messagesForAi = [...useChatStore.getState().messages];

        messagesForAi.push({
            id: crypto.randomUUID(),
            role: "user",
            content: mergedText,
            createdAt: Date.now(),
        });

        clearBuffer();
        setTyping(true);

        try {
            await sleep(AI_DELAY_MS);

            const res = await withClientTimeout(
                sendChatAction({
                    messages: messagesForAi,
                    context: ctx,
                }),
            );

            if (!res.success) {
                toast.error(res.message || "No se pudo procesar tu solicitud");
                addMessage({
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: res.message || "No pude responder en este momento. Intenta nuevamente.",
                    createdAt: Date.now(),
                });
                return;
            }

            const reply = res.data?.message;
            if (!reply?.content) {
                toast.error("Respuesta vacia del copiloto");
                return;
            }

            addMessage(reply);
        } catch (error) {
            const timeout = error instanceof Error && error.message === "client_timeout";
            toast.error(timeout ? "El copiloto tardo demasiado en responder" : "Error consultando el copiloto");
            addMessage({
                id: crypto.randomUUID(),
                role: "assistant",
                content: timeout
                    ? "La consulta quedo sin respuesta por tiempo de espera. Intenta de nuevo o revisa la API key del proveedor IA."
                    : "Ocurrio un error consultando el copiloto. Intenta de nuevo.",
                createdAt: Date.now(),
            });
        } finally {
            setTyping(false);
            setFlushTimer(null);
        }
    };

    const scheduleFlush = () => {
        if (flushTimer) clearTimeout(flushTimer);

        const t = setTimeout(() => {
            flush();
        }, WAIT_MS);

        setFlushTimer(t);
    };

    const sendLocal = () => {
        const value = text.trim();
        if (!value || isTyping) return;

        if (dictation.listening) {
            dictation.stop();
        }

        const userMsg = {
            id: crypto.randomUUID(),
            role: "user" as const,
            content: value,
            createdAt: Date.now(),
        };

        addMessage(userMsg);
        enqueueUserMessage(userMsg);

        setText("");
        scheduleFlush();
    };

    const laDerecha = {
        compacta: true,
        conVoz: true,
        conNota: false,
        hayDictado: dictation.supported,
        dictando: dictation.listening,
        grabando: false,
        hayAlgoQueEnviar: text.trim().length > 0,
    };

    return (
        <div
            data-barra="escribir"
            className={cn(
                MARCO_DE_LA_BARRA,
                "bg-background",
                mobile && "pb-[max(0.375rem,env(safe-area-inset-bottom))]",
            )}
        >
            <div className={FILA_DE_LA_BARRA}>
                <ZonaDeHerramientas
                    compacta
                    abierta={herramientas}
                    alAlternar={() => setHerramientas((v) => !v)}
                    contenedorRef={zona}
                >
                    <OpcionesRapidas onElegida={() => setHerramientas(false)} />
                </ZonaDeHerramientas>
                <div className="relative min-w-0 flex-1">
                    <Textarea
                        ref={caja}
                        rows={1}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Escribe tu duda..."
                        aria-label="Escribe tu duda"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendLocal();
                            }
                        }}
                        disabled={isTyping}
                        className={cn(
                            "min-h-10 w-full resize-none overflow-y-auto rounded-xl py-2 pl-4 text-base leading-relaxed shadow-sm sm:text-sm",
                            rellenoParaLosBotones(laDerecha),
                        )}
                    />
                    <BotonesDeLaDerecha
                        {...laDerecha}
                        menuAbierto={false}
                        alAlternarMenu={() => {}}
                        dictado={
                            dictation.supported
                                ? {
                                      alPulsar: () => {
                                          if (!isTyping) dictation.toggle(text, setText);
                                      },
                                      deshabilitado: isTyping,
                                      marcado: dictation.listening,
                                      etiqueta: dictation.listening ? "Detener dictado" : "Dictar por voz",
                                      clase: dictation.listening
                                          ? `${BOTON_REDONDO_GRABANDO} animate-pulse`
                                          : undefined,
                                      icono: (
                                          <Mic
                                              className={cn(
                                                  "h-3.5 w-3.5",
                                                  dictation.listening ? "text-white" : "text-black dark:text-white",
                                              )}
                                          />
                                      ),
                                  }
                                : null
                        }
                        enviar={{
                            alPulsar: sendLocal,
                            deshabilitado: isTyping || !text.trim(),
                            etiqueta: "Enviar mensaje",
                            clase: BOTON_DE_ENVIAR,
                            icono: <SendIcon className="h-3.5 w-3.5 text-white" />,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
