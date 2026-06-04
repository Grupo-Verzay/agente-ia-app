"use client";

import { X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageList } from "./MessageList";
import { ChatComposer } from "./ChatComposer";
import { useChatContext } from "../hooks/useChatContext";
import { breadcrumbLabels } from "@/components/custom";

export function ChatSheet({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const ctx = useChatContext();
    const labelFromDict = breadcrumbLabels[ctx.pathname.split("/")[1]] ?? "Seccion actual";
    const desktopPanelId = "ai-chat-sheet-desktop";
    const mobilePanelId = "ai-chat-sheet-mobile";

    return (
        <>
            <div
                className="pointer-events-none fixed right-0 top-0 z-50 hidden h-[100dvh] w-[min(420px,calc(100vw-3.5rem))] sm:block"
            >
                <ChatPanel
                    panelId={desktopPanelId}
                    labelFromDict={labelFromDict}
                    onClose={() => onOpenChange(false)}
                    className={open ? "translate-x-0" : "translate-x-full"}
                />
            </div>

            <div className="pointer-events-none fixed inset-0 z-50 sm:hidden">
                <ChatPanel
                    mobile
                    panelId={mobilePanelId}
                    labelFromDict={labelFromDict}
                    onClose={() => onOpenChange(false)}
                    className={open ? "translate-x-0" : "translate-x-full"}
                />
            </div>
        </>
    );
}

function ChatPanel({
    panelId,
    labelFromDict,
    className,
    mobile = false,
    onClose,
}: {
    panelId: string;
    labelFromDict: string;
    className?: string;
    mobile?: boolean;
    onClose?: () => void;
}) {
    return (
        <section
            id={panelId}
            aria-label="Asistente IA"
            className={cn(
                "pointer-events-auto flex flex-col overflow-hidden bg-background transition-transform duration-500 [transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)]",
                mobile
                    ? "absolute inset-0 h-[100dvh] w-screen border-0 shadow-none"
                    : "absolute right-0 top-0 h-[100dvh] w-full rounded-l-[28px] border border-r-0",
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
                    <div>
                        <h2 className="text-base font-semibold">Asistente IA</h2>
                        <p className="text-xs text-muted-foreground">
                            Contexto: <span className="font-medium">{labelFromDict}</span>
                        </p>
                    </div>

                    {onClose ? (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cerrar chat"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    ) : null}
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
                <ChatComposer />
            </div>
        </section>
    );
}
