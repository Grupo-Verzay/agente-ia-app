"use client";

import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/ai-chat/useChatStore";

export function TypingBubble() {
    const setTyping = useChatStore((s) => s.setTyping);

    return (
        <div className="flex justify-start">
            <div className="bg-muted text-foreground rounded-2xl px-3 py-2 text-sm flex items-center gap-2">
                <span className="text-muted-foreground">Escribiendo</span>
                <span className="flex gap-1">
                    <span className="animate-bounce">.</span>
                    <span className="animate-bounce [animation-delay:120ms]">.</span>
                    <span className="animate-bounce [animation-delay:240ms]">.</span>
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-6 rounded-md px-2 text-xs"
                    onClick={() => setTyping(false)}
                >
                    Detener
                </Button>
            </div>
        </div>
    );
}
