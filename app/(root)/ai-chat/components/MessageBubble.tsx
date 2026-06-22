"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";

function extractRoute(content: string): string | null {
    const lines = content.split("\n");
    const routeLine = lines.find((line) => /ruta(\s+sugerida)?\s*:/i.test(line));
    const route = routeLine?.match(/\/[a-z0-9/_?=&.-]*/i)?.[0]?.trim();

    if (!route?.startsWith("/")) return null;
    if (route.includes("http://") || route.includes("https://")) return null;

    return route;
}

function extractActions(content: string): string[] {
    const line = content
        .split("\n")
        .find((item) => item.toLowerCase().includes("acciones sugeridas"));

    if (!line) return [];

    return Array.from(line.matchAll(/\[([^\]]+)\]/g))
        .map((match) => match[1]?.trim())
        .filter(Boolean);
}

function extractSuggestedReply(content: string): string | null {
    const lines = content.split("\n");
    const startIndex = lines.findIndex((line) => /^respuesta sugerida\s*:/i.test(line.trim()));

    if (startIndex < 0) return null;

    const firstLine = lines[startIndex].replace(/^respuesta sugerida\s*:/i, "").trim();
    const replyLines = firstLine ? [firstLine] : [];

    for (const line of lines.slice(startIndex + 1)) {
        if (/^(ruta(\s+sugerida)?|acciones sugeridas|nota|pasos|resumen rapido|intencion|proxima accion)\s*:/i.test(line.trim())) {
            break;
        }
        replyLines.push(line);
    }

    const reply = replyLines.join("\n").trim();
    return reply || null;
}

function normalizeAction(action: string) {
    return action
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function getLeadStatusFromAction(action: string): "FRIO" | "TIBIO" | "CALIENTE" | "FINALIZADO" | "DESCARTADO" | null {
    const normalized = normalizeAction(action);
    if (normalized.includes("frio")) return "FRIO";
    if (normalized.includes("tibio")) return "TIBIO";
    if (normalized.includes("caliente")) return "CALIENTE";
    if (normalized.includes("finalizado") || normalized.includes("cerrado")) return "FINALIZADO";
    if (normalized.includes("descartado")) return "DESCARTADO";
    return null;
}

function getLeadStatusLabel(status: NonNullable<ReturnType<typeof getLeadStatusFromAction>>) {
    const labels = {
        FRIO: "frio",
        TIBIO: "tibio",
        CALIENTE: "caliente",
        FINALIZADO: "finalizado",
        DESCARTADO: "descartado",
    };
    return labels[status];
}

function getActionRoute(action: string, route: string | null): string | null {
    const normalized = normalizeAction(action);

    if (normalized.includes("abrir modulo")) return route;
    if (normalized.includes("revisar configuracion")) return route ?? "/profile";
    if (normalized.includes("diagnostico ia")) return "/profile";
    if (normalized.includes("configurar api")) return "/profile";
    if (normalized.includes("crear tarea")) return "/tareas";
    if (normalized.includes("crear nota")) return "/chats";
    if (normalized.includes("marcar") && getLeadStatusFromAction(action)) return "/chats";
    if (normalized.includes("abrir crm")) return "/crm";
    if (normalized.includes("revisar seguimiento")) return "/crm";
    if (normalized.includes("sugerir mensaje")) return "/chats";
    if (normalized.includes("usar respuesta")) return "/chats";
    if (normalized.includes("disenar flujo")) return "/workflow";
    if (normalized.includes("revisar instrucciones")) return "/ia";
    if (normalized.includes("abrir")) return route;

    return route;
}

export function MessageBubble({
    role,
    content,
}: {
    role: "user" | "assistant" | "system";
    content: string;
}) {
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const isUser = role === "user";
    const route = !isUser ? extractRoute(content) : null;
    const actions = !isUser ? extractActions(content) : [];
    const suggestedReply = !isUser ? extractSuggestedReply(content) : null;
    const canUseSuggestedReply = Boolean(suggestedReply && pathname.startsWith("/chats"));
    const visibleActions = actions.filter((action) => {
            const normalized = normalizeAction(action);
            if (canUseSuggestedReply && normalized.includes("usar respuesta")) return false;
            if (getLeadStatusFromAction(action) && !pathname.startsWith("/chats")) return false;
            return true;
        });

    return (
        <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed space-y-2",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
            >
                <div className="whitespace-pre-wrap">{content}</div>

                {!isUser && (route || visibleActions.length > 0 || canUseSuggestedReply) ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {route ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 rounded-md px-2 text-xs"
                                onClick={() => router.push(route)}
                            >
                                Ir a {route}
                            </Button>
                        ) : null}

                        {canUseSuggestedReply ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 rounded-md px-2 text-xs"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
                                        detail: { action: "insert_text", text: suggestedReply },
                                    }));
                                }}
                            >
                                Usar respuesta
                            </Button>
                        ) : null}

                        {visibleActions.map((action) => {
                            const actionRoute = getActionRoute(action, route);
                            const normalizedAction = normalizeAction(action);
                            return (
                                <Button
                                    key={action}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 rounded-md px-2 text-xs"
                                    disabled={!actionRoute}
                                    onClick={() => {
                                        if (normalizedAction.includes("crear tarea") && pathname.startsWith("/chats")) {
                                            window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
                                                detail: { action: "create_task" },
                                            }));
                                            return;
                                        }

                                        if (normalizedAction.includes("crear nota") && pathname.startsWith("/chats")) {
                                            window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
                                                detail: {
                                                    action: "create_note",
                                                    text: suggestedReply ? `Respuesta sugerida por copiloto: ${suggestedReply}` : undefined,
                                                },
                                            }));
                                            return;
                                        }

                                        const leadStatus = getLeadStatusFromAction(action);
                                        if (normalizedAction.includes("marcar") && leadStatus && pathname.startsWith("/chats")) {
                                            const confirmed = window.confirm(
                                                `Quieres cambiar el estado del lead a ${getLeadStatusLabel(leadStatus)}?`,
                                            );
                                            if (!confirmed) return;

                                            window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
                                                detail: { action: "update_lead_status", leadStatus },
                                            }));
                                            return;
                                        }

                                        if (normalizedAction.includes("usar respuesta") && suggestedReply && pathname.startsWith("/chats")) {
                                            window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
                                                detail: { action: "insert_text", text: suggestedReply },
                                            }));
                                            return;
                                        }

                                        if (normalizedAction.includes("sugerir mensaje") && pathname.startsWith("/chats")) {
                                            window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
                                                detail: { action: "suggest_reply" },
                                            }));
                                            return;
                                        }

                                        if (actionRoute) router.push(actionRoute);
                                    }}
                                >
                                    {action}
                                </Button>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
