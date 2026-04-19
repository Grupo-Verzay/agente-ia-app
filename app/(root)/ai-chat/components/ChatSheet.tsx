"use client";

import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageList } from "./MessageList";
import { ChatComposer } from "./ChatComposer";
import { useChatContext } from "../hooks/useChatContext";
import { breadcrumbLabels } from "@/components/custom";
import { ChatLauncher } from "./ChatLauncher";

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
    const layoutVars = {
        "--chat-panel-width": "min(420px, calc(100vw - 3.5rem))",
        "--chat-panel-height": "100dvh",
        "--chat-launcher-overlap": "14px",
    } as CSSProperties;

    return (
        <>
            <div
                className="pointer-events-none fixed right-0 top-1/2 z-50 hidden -translate-y-1/2 sm:block"
                style={layoutVars}
            >
                <div className="relative h-[var(--chat-panel-height)] w-0">
                    <div
                        className={cn(
                            "pointer-events-auto absolute top-1/2 z-10 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)]",
                            open ? "translate-x-[calc(var(--chat-launcher-overlap)-var(--chat-panel-width))]" : "translate-x-0",
                        )}
                        style={{ right: 0, transformOrigin: "center right" }}
                    >
                        <div className="-translate-y-1/2">
                            <ChatLauncher
                                open={open}
                                onOpenChange={onOpenChange}
                                controlsId={desktopPanelId}
                            />
                        </div>
                    </div>

                    <ChatPanel
                        panelId={desktopPanelId}
                        labelFromDict={labelFromDict}
                        className={open ? "translate-x-0" : "translate-x-full"}
                    />
                </div>
            </div>

            <div className="pointer-events-none fixed inset-0 z-50 sm:hidden">
                <div
                    className={cn(
                        "pointer-events-auto absolute right-0 top-1/2 -translate-y-1/2 transition-opacity duration-300",
                        open && "pointer-events-none opacity-0",
                    )}
                >
                    <ChatLauncher
                        open={open}
                        onOpenChange={onOpenChange}
                        controlsId={mobilePanelId}
                    />
                </div>

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
                    : "absolute right-0 top-0 h-[var(--chat-panel-height)] w-[var(--chat-panel-width)] rounded-l-[28px] border border-r-0]",
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

                    {mobile ? (
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
