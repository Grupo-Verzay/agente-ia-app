"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bug, ChevronDown, Clipboard, Download, Home, RefreshCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type ErrorScreenProps = {
    error?: unknown;
    componentStack?: string; // desde componentDidCatch
    onRetry?: () => void;
    onHome?: () => void;
    onReport?: (data: ErrorReportPayload) => Promise<void> | void;
    buildInfo?: { version?: string; gitSha?: string };
};

export type ErrorReportPayload = {
    eventId: string;
    timestamp: string;
    url?: string;
    userAgent?: string;
    build?: { version?: string; gitSha?: string };
    error?: {
        name?: string;
        message?: string;
        stack?: string;
    };
    react?: {
        componentStack?: string;
    };
};

function normalizeError(e: unknown): { name?: string; message?: string; stack?: string } {
    if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack };
    if (typeof e === "string") return { name: "Error", message: e, stack: undefined };
    try {
        return { name: (e as any)?.name ?? "Error", message: JSON.stringify(e), stack: undefined };
    } catch {
        return { name: "Error", message: "Unknown error", stack: undefined };
    }
}

export default function ErrorScreen({
    error,
    componentStack,
    onRetry,
    onHome,
    onReport,
    buildInfo,
}: ErrorScreenProps) {
    const [open, setOpen] = useState(false);
    const [reporting, setReporting] = useState(false);
    const [copied, setCopied] = useState(false);

    const eventId = useMemo(() => crypto.randomUUID(), []);
    const normalized = useMemo(() => normalizeError(error), [error]);

    const payload: ErrorReportPayload = useMemo(
        () => ({
            eventId,
            timestamp: new Date().toISOString(),
            url: typeof window !== "undefined" ? window.location.href : undefined,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            build: { version: buildInfo?.version, gitSha: buildInfo?.gitSha },
            error: normalized,
            react: { componentStack },
        }),
        [componentStack, eventId, normalized, buildInfo]
    );

    const prettyJson = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

    const copy = async () => {
        await navigator.clipboard.writeText(prettyJson);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const download = () => {
        const blob = new Blob([prettyJson], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `error-${eventId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const submitReport = async () => {
        if (!onReport) return;
        try {
            setReporting(true);
            await onReport(payload);
        } finally {
            setReporting(false);
        }
    };

    return (
        <div className="w-full h-[100vh] overflow-y-auto overflow-x-hidden flex items-start justify-center bg-gradient-to-b from-background to-muted/50 p-4">
            <Card className="w-full max-w-2xl backdrop-blur supports-[backdrop-filter]:bg-background/80 border border-border/60 shadow-lg">
                <CardHeader className="space-y-2">
                    {/* 
                    <div className="flex items-center gap-2">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-xl">Algo no salió como esperábamos</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Tranquilo, tu información está segura. Estamos trabajando para solucionarlo.
                    </p> */}
                    <div className="flex items-center gap-2">
                        {buildInfo?.version && <Badge variant="secondary">v{buildInfo.version}</Badge>}
                        {buildInfo?.gitSha && <Badge variant="outline">sha:{buildInfo.gitSha.slice(0, 7)}</Badge>}
                        <Badge variant="outline">id:{eventId.slice(0, 8)}</Badge>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Vista simple para stakeholders */}
                    <div className="rounded-xl border border-border/60 p-4 bg-muted/40">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                                <Bug className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                {/* <p className="font-medium">Estamos actualizando o hubo un pequeño imprevisto.</p> */}
                                <p className="text-sm text-muted-foreground">
                                    {/* Puedes intentar nuevamente o volver al inicio. Si el problema persiste, compártenos el ID del evento. */}
                                    Estamos en mantenimiento de actualizaciones por favor ingresar de nuevo en unos 5 minutos.
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {onRetry && (
                                <Button size="sm" onClick={onRetry}>
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Reintentar
                                </Button>
                            )}
                            {onHome && (
                                <Button size="sm" variant="secondary" onClick={onHome}>
                                    <Home className="mr-2 h-4 w-4" />
                                    Ir al inicio
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpen((v) => !v)}
                                aria-expanded={open}
                                aria-controls="error-details"
                            >
                                Más detalles
                                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                            </Button>
                        </div>
                    </div>

                    {/* Detalles para programadores */}
                    {open && (
                        <div id="error-details" className="space-y-3 min-w-0"> {/* <-- 🔧 */}
                            <Separator />
                            <div className="grid gap-3 min-w-0"> {/* <-- 🔧 */}
                                <div className="grid grid-cols-2 gap-2 text-sm min-w-0"> {/* <-- 🔧 */}
                                    <div className="text-muted-foreground">Nombre</div>
                                    <div className="font-mono min-w-0 break-words">{normalized.name ?? "N/A"}</div> {/* <-- 🔧 */}
                                    <div className="text-muted-foreground">Mensaje</div>
                                    <div className="font-mono min-w-0 break-words">{normalized.message ?? "N/A"}</div> {/* <-- 🔧 */}
                                </div>

                                <div className="min-w-0"> {/* <-- 🔧 wrapper evita estirar grid */}
                                    <div className="text-sm text-muted-foreground mb-1">Stack</div>
                                    <pre
                                        className="block max-w-full max-h-64 overflow-x-auto overflow-y-auto rounded-lg bg-black/5 p-3 text-xs leading-relaxed [white-space:pre]"  /* <-- 🔧 */
                                    >
                                        {normalized.stack ?? "N/A"}
                                    </pre>
                                </div>

                                {componentStack ? (
                                    <div className="min-w-0"> {/* <-- 🔧 */}
                                        <div className="text-sm text-muted-foreground mb-1">React component stack</div>
                                        <pre
                                            className="block max-w-full max-h-64 overflow-x-auto overflow-y-auto rounded-lg bg-black/5 p-3 text-xs leading-relaxed [white-space:pre]" /* <-- 🔧 */
                                        >
                                            {componentStack}
                                        </pre>
                                    </div>
                                ) : null}

                                <div className="min-w-0"> {/* <-- 🔧 */}
                                    <div className="text-sm text-muted-foreground mb-1">Payload</div>
                                    <pre
                                        className="block max-w-full max-h-64 overflow-x-auto overflow-y-auto rounded-lg bg-black/5 p-3 text-xs leading-relaxed [white-space:pre]" /* <-- 🔧 */
                                    >
                                        {prettyJson}
                                    </pre>
                                    ...
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}