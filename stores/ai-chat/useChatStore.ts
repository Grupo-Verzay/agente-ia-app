import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CopilotMode } from "@/app/(root)/ai-chat/copilot";
import type { ChatMessage } from "@/types/ai-assistence-chat";

const LS_KEY = "verzay_chat_onboarding_hidden_v1";

const INITIAL_MESSAGES: ChatMessage[] = [
    {
        id: "welcome",
        role: "assistant",
        content: "Hola, soy tu Copiloto IA. Puedo guiarte por la app, ayudarte con CRM, chats, flujos o configuracion. Dime que necesitas hacer.",
        createdAt: Date.now(),
    },
];

type ChatStore = {
    // UI open/close
    isOpen: boolean;
    setOpen: (v: boolean) => void;

    showOnboarding: boolean;
    setShowOnboarding: (v: boolean) => void;
    initOnboarding: () => void;
    hideOnboardingForever: () => void;

    // mensajes + typing
    messages: ChatMessage[];
    isTyping: boolean;
    setTyping: (v: boolean) => void;
    copilotMode: CopilotMode;
    setCopilotMode: (v: CopilotMode) => void;
    clearMessages: () => void;

    // buffer para concatenar
    buffer: ChatMessage[];
    flushTimer: any | null;

    addMessage: (m: ChatMessage) => void;
    enqueueUserMessage: (m: ChatMessage) => void;
    clearBuffer: () => void;
    setFlushTimer: (t: any | null) => void;
};

export const useChatStore = create<ChatStore>()(
    persist(
        (set) => ({
            isOpen: false,
            setOpen: (v) => set({ isOpen: v }),

            showOnboarding: false,
            setShowOnboarding: (v) => set({ showOnboarding: v }),
            initOnboarding: () => {
                try {
                    const hidden = localStorage.getItem(LS_KEY) === "1";
                    set({ showOnboarding: !hidden });
                } catch {
                    set({ showOnboarding: true });
                }
            },
            hideOnboardingForever: () => {
                try {
                    localStorage.setItem(LS_KEY, "1");
                } catch (error) {
                    console.error("[hideOnboardingForever] localStorage no disponible", error);
                }
                set({ showOnboarding: false });
            },

            messages: INITIAL_MESSAGES,
            isTyping: false,
            setTyping: (v) => set({ isTyping: v }),
            copilotMode: "auto",
            setCopilotMode: (v) => set({ copilotMode: v }),
            clearMessages: () => set({ messages: INITIAL_MESSAGES, buffer: [], isTyping: false }),

            buffer: [],
            flushTimer: null,

            addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
            enqueueUserMessage: (m) => set((s) => ({ buffer: [...s.buffer, m] })),
            clearBuffer: () => set({ buffer: [] }),
            setFlushTimer: (t) => set({ flushTimer: t }),
        }),
        {
            name: "verzay_copilot_chat_v1",
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                messages: state.messages,
                copilotMode: state.copilotMode,
            }),
            merge: (persistedState, currentState) => {
                const persisted = persistedState as Partial<ChatStore> | undefined;
                return {
                    ...currentState,
                    messages: persisted?.messages?.length ? persisted.messages : INITIAL_MESSAGES,
                    copilotMode: persisted?.copilotMode ?? "auto",
                    isOpen: false,
                    isTyping: false,
                    buffer: [],
                    flushTimer: null,
                };
            },
        },
    ),
);
