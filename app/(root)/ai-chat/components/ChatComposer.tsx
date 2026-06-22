"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SendHorizontal, Mic } from "lucide-react";

import { useChatContext } from "../hooks/useChatContext";
import { mergeBufferedUserMessages } from "../helpers/mergeBufferedUserMessages";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { sendChatAction } from "@/actions/ai-chat-actions";

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

export function ChatComposer() {
    const [text, setText] = useState("");

    // Dictado por voz (Web Speech API del navegador)
    const [speechSupported, setSpeechSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const baseTextRef = useRef("");

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

    // Detecta soporte de dictado y limpia el reconocimiento al desmontar.
    useEffect(() => {
        const SR =
            typeof window !== "undefined" &&
            ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
        setSpeechSupported(!!SR);
        return () => {
            try {
                recognitionRef.current?.stop();
            } catch {
                /* noop */
            }
        };
    }, []);

    const toggleDictation = () => {
        if (isTyping) return;

        if (listening) {
            recognitionRef.current?.stop();
            return;
        }

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            toast.error("Tu navegador no soporta dictado por voz");
            return;
        }

        const recognition = new SR();
        recognition.lang = "es-ES";
        recognition.continuous = true;
        recognition.interimResults = true;

        // Conserva lo ya escrito y le va sumando lo dictado.
        baseTextRef.current = text.trim() ? `${text.trim()} ` : "";

        recognition.onresult = (event: any) => {
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            setText((baseTextRef.current + transcript).trimStart());
        };
        recognition.onerror = (event: any) => {
            setListening(false);
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                toast.error("Permiso de micrófono denegado");
            } else if (event.error === "no-speech") {
                toast.message("No se detectó voz");
            }
        };
        recognition.onend = () => setListening(false);

        recognitionRef.current = recognition;
        try {
            recognition.start();
            setListening(true);
        } catch {
            setListening(false);
        }
    };

    const sendLocal = () => {
        const value = text.trim();
        if (!value || isTyping) return;

        if (listening) {
            recognitionRef.current?.stop();
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

    return (
        <div className="flex items-end gap-2">
            <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe tu duda... Enter para enviar"
                className="h-11 text-sm"
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendLocal();
                    }
                }}
                disabled={isTyping}
            />
            {speechSupported && (
                <Button
                    type="button"
                    onClick={toggleDictation}
                    size="icon"
                    variant={listening ? "default" : "outline"}
                    className={`h-11 w-11 shrink-0 rounded-md ${listening ? "animate-pulse bg-red-500 text-white hover:bg-red-600" : ""}`}
                    disabled={isTyping}
                    aria-label={listening ? "Detener dictado" : "Dictar por voz"}
                    title={listening ? "Detener dictado" : "Dictar por voz"}
                >
                    <Mic className="h-4 w-4" />
                </Button>
            )}
            <Button
                type="button"
                onClick={sendLocal}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-md"
                disabled={isTyping}
                aria-label="Enviar mensaje"
            >
                <SendHorizontal className="h-4 w-4" />
            </Button>
        </div>
    );
}
