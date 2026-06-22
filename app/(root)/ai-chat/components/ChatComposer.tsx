"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SendHorizontal } from "lucide-react";

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
