"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

function extractRoute(content: string): string | null {
    // Busca línea: "Ruta: /crm/leads/123"
    const lines = content.split("\n");
    const routeLine = lines.find((l) => l.trim().toLowerCase().startsWith("ruta:"));
    if (!routeLine) return null;

    const route = routeLine.split(":").slice(1).join(":").trim();
    if (!route.startsWith("/")) return null;

    // seguridad básica: solo rutas internas
    if (route.includes("http://") || route.includes("https://")) return null;

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
    const isUser = role === "user";
    const route = !isUser ? extractRoute(content) : null;

    return (
        <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed space-y-2",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
            >
                <div className="whitespace-pre-wrap">{content}</div>

                {!isUser && route ? (
                    <div className="pt-1">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => router.push(route)}
                        >
                            Ir a {route}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}