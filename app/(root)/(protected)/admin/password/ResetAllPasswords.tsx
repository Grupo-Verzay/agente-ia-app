"use client";

import { useMemo, useState, useTransition } from "react";
import { hashAllPasswords } from "@/actions/hash-all-passwords";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type LogLine = { ts: string; level: "info" | "warn" | "error"; msg: string };

export const ResetAllPasswords = () => {
    const [pending, startTransition] = useTransition();
    const [logs, setLogs] = useState<LogLine[]>([]);
    const [result, setResult] = useState<any>(null);

    const addLog = (level: LogLine["level"], msg: string) => {
        const line = { ts: new Date().toISOString(), level, msg };
        if (level === "error") console.error("[hashAllPasswords]", msg);
        else if (level === "warn") console.warn("[hashAllPasswords]", msg);
        else console.log("[hashAllPasswords]", msg);
    };

    const progress = useMemo(() => {
        if (!result?.totalToUpdate) return 0;
        const done = result?.updatedSoFar ?? 0;
        return Math.min(100, Math.round((done / result.totalToUpdate) * 100));
    }, [result]);

    const run = () => {
        addLog("info", "Iniciando reseteo/hash masivo...");
        toast.loading("Procesando contraseñas...", { id: "hash-all" });

        startTransition(async () => {
            try {
                addLog("info", "Llamando server action hashAllPasswords()");
                const res = await hashAllPasswords();

                setResult(res);

                addLog("info", `Respuesta: ${JSON.stringify(res)}`);

                if (res.success) {
                    toast.success(res.message ?? "Listo", { id: "hash-all" });
                } else {
                    toast.error(res.message ?? "Falló", { id: "hash-all" });
                }

                // Si hay errores por batch, loguearlos
                if (res.errors?.length) {
                    res.errors.forEach((e: string) => addLog("error", e));
                }
            } catch (e: any) {
                const msg = e?.message ?? String(e);
                addLog("error", msg);
                toast.error(msg, { id: "hash-all" });
            }
        });
    };

    return (
        <div className="space-y-3 w-full h-full">
            <div className="flex items-center gap-2">
                <Button disabled={pending} onClick={run}>
                    {pending ? "Procesando..." : "Resetear contraseñas"}
                </Button>

                {result && (
                    <span className="text-xs text-muted-foreground">
                        Progreso: {progress}% ({result.updatedSoFar ?? 0}/{result.totalToUpdate ?? 0})
                    </span>
                )}
            </div>

            {/* Barra simple */}
            {result && (
                <div className="w-full h-2 rounded bg-muted overflow-hidden">
                    <div
                        className="h-2 rounded bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* Resumen */}
            {result && (
                <div className="text-xs rounded border p-3 space-y-1">
                    <div><b>Mensaje:</b> {result.message}</div>
                    <div><b>Encontrados:</b> {result.totalFound ?? "-"}</div>
                    <div><b>A actualizar (no bcrypt):</b> {result.totalToUpdate ?? "-"}</div>
                    <div><b>Actualizados:</b> {result.updatedSoFar ?? "-"}</div>
                    <div><b>Saltados (null):</b> {result.skippedNullPassword ?? "-"}</div>
                    <div><b>Saltados (ya bcrypt):</b> {result.skippedAlreadyBcrypt ?? "-"}</div>
                    {!!result.errors?.length && (
                        <div className="text-destructive"><b>Errores:</b> {result.errors.length}</div>
                    )}
                </div>
            )}

            {/* Logs */}
            <div className="rounded border p-3">
                <div className="text-xs font-medium mb-2">Logs (últimos primero)</div>
                <div className="max-h-56 overflow-auto text-[11px] space-y-1">
                    {logs.length === 0 ? (
                        <div className="text-muted-foreground">Sin logs todavía.</div>
                    ) : (
                        logs.map((l, i) => (
                            <div key={i} className="font-mono">
                                <span className="text-muted-foreground">{l.ts}</span>{" "}
                                <span
                                    className={
                                        l.level === "error"
                                            ? "text-destructive"
                                            : l.level === "warn"
                                                ? "text-yellow-600"
                                                : ""
                                    }
                                >
                                    [{l.level}]
                                </span>{" "}
                                {l.msg}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
