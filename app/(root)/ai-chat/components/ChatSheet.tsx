"use client";

import { Trash2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageList } from "./MessageList";
import { ChatComposer } from "./ChatComposer";
import { QuickActions } from "./QuickActions";
import { useChatContext } from "../hooks/useChatContext";
import {
    COPILOT_MODE_DESCRIPTIONS,
    COPILOT_MODE_ICONS,
    COPILOT_MODE_LABELS,
    COPILOT_MODES,
} from "../copilot";
import { useChatStore } from "@/stores/ai-chat/useChatStore";

export function ChatSheet({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const ctx = useChatContext();
    const desktopPanelId = "ai-chat-sheet-desktop";
    const mobilePanelId = "ai-chat-sheet-mobile";

    return (
        <>
            <div className="pointer-events-none fixed right-0 top-0 z-50 hidden h-[100dvh] w-[min(440px,calc(100vw-3.5rem))] sm:block">
                <ChatPanel
                    panelId={desktopPanelId}
                    moduleLabel={ctx.moduleLabel ?? "Seccion actual"}
                    resolvedMode={ctx.resolvedCopilotMode ?? "general"}
                    onClose={() => onOpenChange(false)}
                    className={open ? "translate-x-0" : "translate-x-full"}
                />
            </div>

            <div className="pointer-events-none fixed inset-0 z-50 sm:hidden">
                <ChatPanel
                    mobile
                    panelId={mobilePanelId}
                    moduleLabel={ctx.moduleLabel ?? "Seccion actual"}
                    resolvedMode={ctx.resolvedCopilotMode ?? "general"}
                    onClose={() => onOpenChange(false)}
                    className={open ? "translate-x-0" : "translate-x-full"}
                />
            </div>
        </>
    );
}

function ChatPanel({
    panelId,
    moduleLabel,
    resolvedMode,
    className,
    mobile = false,
    onClose,
}: {
    panelId: string;
    moduleLabel: string;
    resolvedMode: string;
    className?: string;
    mobile?: boolean;
    onClose?: () => void;
}) {
    const copilotMode = useChatStore((s) => s.copilotMode);
    const setCopilotMode = useChatStore((s) => s.setCopilotMode);
    const clearMessages = useChatStore((s) => s.clearMessages);
    const ResolvedIcon = COPILOT_MODE_ICONS[resolvedMode as keyof typeof COPILOT_MODE_ICONS] ?? COPILOT_MODE_ICONS.general;

    return (
        <section
            id={panelId}
            aria-label="Copiloto IA"
            className={cn(
                "pointer-events-auto flex flex-col overflow-hidden bg-background shadow-2xl shadow-black/10 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)]",
                mobile
                    ? "absolute inset-0 h-[100dvh] w-screen border-0 shadow-none"
                    : "absolute right-0 top-0 h-[100dvh] w-full rounded-l-lg border border-r-0",
                className,
            )}
        >
            <header
                className={cn(
                    "border-b px-4 py-3",
                    mobile && "pt-[max(0.75rem,env(safe-area-inset-top))]",
                )}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <ResolvedIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="truncate text-base font-semibold">Copiloto IA</h2>
                                <p className="truncate text-xs text-muted-foreground">
                                    {COPILOT_MODE_LABELS[resolvedMode as keyof typeof COPILOT_MODE_LABELS]} en {moduleLabel}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={clearMessages}
                            aria-label="Limpiar conversacion"
                            title="Limpiar conversacion"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>

                        {onClose ? (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cerrar copiloto"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        ) : null}
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Modos del copiloto">
                    {COPILOT_MODES.map((mode) => {
                        const Icon = COPILOT_MODE_ICONS[mode];
                        const isActive = copilotMode === mode;
                        return (
                            <button
                                key={mode}
                                type="button"
                                title={COPILOT_MODE_DESCRIPTIONS[mode]}
                                aria-pressed={isActive}
                                onClick={() => setCopilotMode(mode)}
                                className={cn(
                                    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
                                    isActive
                                        ? "border-primary/30 bg-primary/10 text-primary"
                                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{COPILOT_MODE_LABELS[mode]}</span>
                            </button>
                        );
                    })}
                </div>
            </header>

            <ScrollArea className="flex-1 px-3 py-3">
                <MessageList />
            </ScrollArea>

            <div
                className={cn(
                    "space-y-2 border-t px-3 py-3",
                    mobile && "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                )}
            >
                <QuickActions />
                <ChatComposer />
            </div>
        </section>
    );
}
