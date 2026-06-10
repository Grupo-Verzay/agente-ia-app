"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { patchKeywordsSection } from "@/actions/system-prompt-actions";
import type { KeywordRule } from "@/types/agentAi";
import { toast } from "sonner";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

function createDebounced<F extends (...args: any[]) => any>(fn: F, ms = 700) {
    let t: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<F>) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
    (debounced as unknown as { cancel: () => void }).cancel = () => {
        if (t) clearTimeout(t);
        t = null;
    };
    return debounced as F & { cancel: () => void };
}

export function useKeywordsAutosave(opts: {
    promptId: string;
    version: number;
    rules: KeywordRule[];
    onVersionChange: (next: number) => void;
    onConflict?: (serverState: any) => void;
    onStatusChange?: (status: AutosaveStatus) => void;
    mode?: "auto" | "manual";
}) {
    const { promptId, version, rules, onVersionChange, onConflict, onStatusChange, mode = "auto" } = opts;

    const versionRef = useRef(version);
    useEffect(() => { versionRef.current = version; }, [version]);

    const conflictRef = useRef<typeof onConflict>();
    useEffect(() => { conflictRef.current = onConflict; }, [onConflict]);

    const mountedRef = useRef(false);
    useEffect(() => { mountedRef.current = true; }, []);

    const rulesHash = useMemo(() => JSON.stringify(rules), [rules]);
    const lastHashRef = useRef<string>("");

    const notifyStatus = useCallback((status: AutosaveStatus) => { onStatusChange?.(status); }, [onStatusChange]);

    const saveFn = useCallback(async (payload: { rules: KeywordRule[] }) => {
        if (!promptId || !mountedRef.current) return;
        notifyStatus("saving");
        try {
            const res = await patchKeywordsSection({ promptId, version: versionRef.current, data: { rules: payload.rules } });
            if (res?.conflict) {
                notifyStatus("error");
                toast.warning("Conflicto al guardar palabras clave. Recarga la página.");
                conflictRef.current?.(res.data);
                return;
            }
            if (res?.ok && res?.data?.version) {
                versionRef.current = res.data.version;
                onVersionChange(res.data.version);
                notifyStatus("saved");
            } else {
                notifyStatus("error");
                toast.error("No se pudo guardar las palabras clave.");
            }
        } catch {
            notifyStatus("error");
            toast.error("Error al guardar las palabras clave.");
        }
    }, [promptId, onVersionChange, notifyStatus]);

    const runSave = useMemo(() => createDebounced(saveFn, 700), [saveFn]);

    useEffect(() => {
        if (mode === "manual" || !promptId) return;
        if (lastHashRef.current === rulesHash) return;
        lastHashRef.current = rulesHash;
        runSave({ rules });
        return () => { runSave.cancel?.(); };
    }, [mode, promptId, rulesHash, rules, runSave]);

    const forceSave = useCallback(async () => {
        if (!promptId) return;
        lastHashRef.current = rulesHash;
        await saveFn({ rules });
    }, [promptId, rules, rulesHash, saveFn]);

    return { forceSave };
}
