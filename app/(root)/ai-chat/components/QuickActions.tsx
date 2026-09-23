"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendChatAction } from "@/actions/ai-chat-actions";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { useChatContext } from "../hooks/useChatContext";
import { cn } from "@/lib/utils";

const CLIENT_TIMEOUT_MS = 26000;

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

type Suggestion = {
    label: string;
    prompt: string;
};

const SUGGESTIONS_BY_MODE: Record<string, Suggestion[]> = {
    general: [
        { label: "Explicar pantalla", prompt: "Explicame esta pantalla y dime que puedo hacer aqui." },
        { label: "Ubicar modulo", prompt: "Donde encuentro este modulo o esta funcion dentro de la app?" },
        { label: "Que puedo hacer?", prompt: "Que acciones utiles puedo hacer desde esta pantalla?" },
    ],
    crm: [
        { label: "Resumir lead", prompt: "Resume que deberia revisar de este lead y cual seria la siguiente accion." },
        { label: "Crear seguimiento", prompt: "Ayudame a crear un seguimiento para este lead. Que datos necesito?" },
        { label: "Sugerir estado", prompt: "Que estado deberia usar para este lead y por que?" },
    ],
    chats: [
        { label: "Sugerir respuesta", prompt: "Sugiere una respuesta profesional para este cliente segun el contexto visible." },
        { label: "Resumir chat", prompt: "Resume la conversacion actual y dime la siguiente accion recomendada." },
        { label: "Seguimiento", prompt: "Que seguimiento conviene crear para este cliente?" },
    ],
    flows: [
        { label: "Mejorar prompt", prompt: "Ayudame a mejorar este prompt o estas instrucciones del agente." },
        { label: "Disenar flujo", prompt: "Disena un flujo base para automatizar este caso." },
        { label: "Revisar agente", prompt: "Revisa las instrucciones del agente y dime que falta o que podria mejorar." },
    ],
    settings: [
        { label: "Revisar config", prompt: "Ayudame a revisar esta configuracion y dime que debo validar." },
        { label: "WhatsApp", prompt: "Donde conecto WhatsApp y que pasos debo seguir?" },
        { label: "Diagnostico IA", prompt: "Haz un diagnostico de mi configuracion IA: proveedor, modelo y API key." },
    ],
};

/**
 * Las sugerencias del modo en curso y cómo se mandan. Es la lógica de siempre;
 * lo que cambió es DÓNDE se pintan: ya no son una rejilla de botones sueltos
 * encima de la caja, sino las opciones del «+» de la barra de escribir, como
 * las herramientas de la conversación y del chat de equipo (`ChatComposer`).
 */
export function useQuickActions() {
    const ctx = useChatContext();
    const addMessage = useChatStore((s) => s.addMessage);
    const setTyping = useChatStore((s) => s.setTyping);
    const isTyping = useChatStore((s) => s.isTyping);

    const suggestions = useMemo(() => {
        const mode = ctx.resolvedCopilotMode ?? "general";
        return SUGGESTIONS_BY_MODE[mode] ?? SUGGESTIONS_BY_MODE.general;
    }, [ctx.resolvedCopilotMode]);

    const sendSuggestion = async (suggestion: Suggestion) => {
        if (isTyping) return;

        const userMsg = {
            id: crypto.randomUUID(),
            role: "user" as const,
            content: suggestion.prompt,
            createdAt: Date.now(),
        };

        addMessage(userMsg);
        setTyping(true);

        try {
            const res = await withClientTimeout(
                sendChatAction({
                    messages: useChatStore.getState().messages,
                    context: ctx,
                }),
            );

            if (!res.success) {
                toast.error(res.message || "No se pudo procesar tu solicitud");
                addMessage({
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: "No pude responder en este momento. Intenta nuevamente.",
                    createdAt: Date.now(),
                });
                return;
            }

            const reply = res.data?.message;
            if (reply?.content) addMessage(reply);
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
        }
    };

    return { suggestions, sendSuggestion, isTyping };
}

/** Una opción del «+»: el rótulo, con la pregunta entera en el `title`. */
export function OpcionesRapidas({ onElegida }: { onElegida?: () => void }) {
    const { suggestions, sendSuggestion, isTyping } = useQuickActions();
    return (
        <div className="flex w-52 flex-col items-stretch gap-0.5" data-opciones-rapidas>
            {suggestions.map((suggestion) => (
                <Button
                    key={suggestion.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isTyping}
                    onClick={() => {
                        onElegida?.();
                        void sendSuggestion(suggestion);
                    }}
                    className={cn("h-8 w-full justify-start rounded-md px-2 text-left text-sm font-normal")}
                    title={suggestion.prompt}
                >
                    <span className="truncate">{suggestion.label}</span>
                </Button>
            ))}
        </div>
    );
}
