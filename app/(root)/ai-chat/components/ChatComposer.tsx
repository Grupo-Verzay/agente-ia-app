"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { useChatContext } from "../hooks/useChatContext";
import { mergeBufferedUserMessages } from "../helpers/mergeBufferedUserMessages";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { sendChatAction } from "@/actions/ai-chat-actions";

const WAIT_MS = 1500;
const AI_DELAY_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ChatComposer() {
    const [text, setText] = useState("");

    const ctx = useChatContext();

    const addMessage = useChatStore((s) => s.addMessage);
    const enqueueUserMessage = useChatStore((s) => s.enqueueUserMessage);
    const clearBuffer = useChatStore((s) => s.clearBuffer);
    const flushTimer = useChatStore((s) => s.flushTimer);
    const setFlushTimer = useChatStore((s) => s.setFlushTimer);
    const setTyping = useChatStore((s) => s.setTyping);

    const flush = async () => {
        const buffer = useChatStore.getState().buffer;
        if (!buffer.length) return;

        // Construye el “mensaje consolidado”
        const mergedText = mergeBufferedUserMessages(buffer);

        // Inserta un solo mensaje “user consolidado” EN EL REQUEST (no necesariamente en UI)
        // En UI ya mostramos cada mensaje individual, eso se queda así.
        // Para la IA, enviamos uno solo:
        const messagesForAi = [...useChatStore.getState().messages];

        // reemplazamos el último tramo de mensajes user por uno consolidado (solo para el request)
        // estrategia simple: añadimos un mensaje extra que diga “Mensajes concatenados:”
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

            const res = await sendChatAction({
                messages: messagesForAi,
                context: ctx,
            });

            if (!res.success) {
                toast.error(res.message || "No se pudo procesar tu solicitud");
                addMessage({
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: "⚠️ No pude responder en este momento. Intenta nuevamente.",
                    createdAt: Date.now(),
                });
                return;
            }

            const reply = res.data?.message;
            if (!reply?.content) {
                toast.error("Respuesta vacía del asistente");
                return;
            }

            addMessage(reply);
        } catch {
            toast.error("Error consultando el asistente");
            addMessage({
                id: crypto.randomUUID(),
                role: "assistant",
                content: "⚠️ Ocurrió un error consultando el asistente. Intenta de nuevo.",
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
        if (!value) return;

        const userMsg = {
            id: crypto.randomUUID(),
            role: "user" as const,
            content: value,
            createdAt: Date.now(),
        };

        // UI: mostramos el mensaje inmediato
        addMessage(userMsg);

        // Buffer: lo guardamos para concatenación
        enqueueUserMessage(userMsg);

        setText("");
        scheduleFlush();
    };

    return (
        <div className="flex gap-2">
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe tu duda... (Enter envía, Shift+Enter salto)"
                className="min-h-[44px] max-h-[120px] resize-none"
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendLocal();
                    }
                }}
                disabled={useChatStore((s) => s.isTyping)}
            />
            <Button
                onClick={sendLocal}
                className="h-[44px]"
                disabled={useChatStore((s) => s.isTyping)}
            >
                Enviar
            </Button>
        </div>
    );
}