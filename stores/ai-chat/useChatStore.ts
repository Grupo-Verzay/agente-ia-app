import { create } from "zustand";
import type { ChatMessage } from "@/types/ai-assistence-chat";

const LS_KEY = "verzay_chat_onboarding_hidden_v1";

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

    // buffer para concatenar
    buffer: ChatMessage[];
    flushTimer: any | null;

    addMessage: (m: ChatMessage) => void;
    enqueueUserMessage: (m: ChatMessage) => void;
    clearBuffer: () => void;
    setFlushTimer: (t: any | null) => void;
};

export const useChatStore = create<ChatStore>((set) => ({
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
        } catch { }
        set({ showOnboarding: false });
    },

    messages: [
        {
            id: "welcome",
            role: "assistant",
            content: "Hola 👋 Dime qué necesitas hacer en la app y te guío paso a paso.",
            createdAt: Date.now(),
        },
    ],
    isTyping: false,
    setTyping: (v) => set({ isTyping: v }),

    buffer: [],
    flushTimer: null,

    addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
    enqueueUserMessage: (m) => set((s) => ({ buffer: [...s.buffer, m] })),
    clearBuffer: () => set({ buffer: [] }),
    setFlushTimer: (t) => set({ flushTimer: t }),
}));