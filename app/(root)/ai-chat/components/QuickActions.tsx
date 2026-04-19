"use client";

import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/ai-chat/useChatStore";

const SUGGESTIONS = [
    "¿Cómo actualizo el nombre de un lead?",
    "¿Cómo cambio el estado del lead?",
    "¿Cómo asigno un lead a un reseller?",
];

export const QuickActions = () => {
    const addMessage = useChatStore((s) => s.addMessage);

    return (
        <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((t) => (
                <Button
                    key={t}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                        addMessage({ id: crypto.randomUUID(), role: "user", content: t, createdAt: Date.now() })
                    }
                >
                    {t}
                </Button>
            ))}
        </div>
    );
}