"use client";

import { Bot, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const ChatLauncher = ({
    open,
    onOpenChange,
    className,
    controlsId = "ai-chat-sheet-desktop",
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    className?: string;
    controlsId?: string;
}) => {
    return (
        <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? "Cerrar copiloto" : "Abrir copiloto"}
            aria-controls={controlsId}
            aria-expanded={open}
            className={cn(
                "group fixed z-40 flex h-12 w-12 items-center justify-center rounded-l-full border border-r-0 border-primary/25 bg-background text-primary shadow-lg shadow-black/10 transition-all hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                "right-0 top-1/2 -translate-y-1/2",
                "max-sm:bottom-5 max-sm:right-4 max-sm:top-auto max-sm:h-14 max-sm:w-14 max-sm:translate-y-0 max-sm:rounded-full max-sm:border max-sm:p-0",
                open && "bg-primary text-primary-foreground",
                className,
            )}
        >
            {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            <span className="sr-only">{open ? "Cerrar copiloto" : "Abrir copiloto"}</span>
        </button>
    );
};
