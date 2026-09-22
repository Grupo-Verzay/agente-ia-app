"use client";

import { Trash2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
    FRANJA_LATERAL,
    FRANJA_LATERAL_MOVIL,
    HOJA_LATERAL,
    HOJA_LATERAL_MOVIL,
    PANEL_DEL_COPILOTO,
} from "@/lib/panel-lateral";
import { usePanelLateral } from "@/hooks/usePanelLateral";
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

    // Chats acomoda la conversación mientras haya un panel abierto, igual que
    // ya hace con la ficha de Contacto. Fuera de Chats esto no hace nada: la
    // regla de CSS está acotada a `[data-chat-view]`.
    //
    // Y el mismo hook aparta a los demás paneles de la franja. Antes eran dos
    // y la exclusión estaba escrita a mano en `BotonesDelBorde`; con cinco, esa
    // cuenta se olvida.
    usePanelLateral(PANEL_DEL_COPILOTO, open, () => onOpenChange(false));

    return (
        <>
            <div className={FRANJA_LATERAL}>
                <ChatPanel
                    panelId={desktopPanelId}
                    moduleLabel={ctx.moduleLabel ?? "Seccion actual"}
                    resolvedMode={ctx.resolvedCopilotMode ?? "general"}
                    onClose={() => onOpenChange(false)}
                    className={open ? "translate-x-0" : "translate-x-full"}
                />
            </div>

            <div className={FRANJA_LATERAL_MOVIL}>
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
            className={cn(mobile ? HOJA_LATERAL_MOVIL : HOJA_LATERAL, className)}
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
