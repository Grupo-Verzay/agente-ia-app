"use client";

export function TypingBubble() {
    return (
        <div className="flex justify-start">
            <div className="bg-muted text-foreground rounded-2xl px-3 py-2 text-sm flex items-center gap-2">
                <span className="text-muted-foreground">Escribiendo</span>
                <span className="flex gap-1">
                    <span className="animate-bounce">.</span>
                    <span className="animate-bounce [animation-delay:120ms]">.</span>
                    <span className="animate-bounce [animation-delay:240ms]">.</span>
                </span>
            </div>
        </div>
    );
}