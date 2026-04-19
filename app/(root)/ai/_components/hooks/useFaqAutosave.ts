// app/(root)/ai/_components/hooks/useFaqAutosave.ts
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { patchFaqSection } from "@/actions/system-prompt-actions";
import type { QaItem } from "@/types/agentAi";
import { toast } from "sonner";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

function createDebounced<F extends (...args: any[]) => any>(fn: F, ms = 700) {
    let t: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<F>) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
    (debounced as any).cancel = () => {
        if (t) clearTimeout(t);
        t = null;
    };
    return debounced as F & { cancel: () => void };
}

export function useFaqAutosave(opts: {
    promptId: string;
    version: number;
    items: QaItem[];
    onVersionChange: (next: number) => void;
    onConflict?: (serverState: any) => void;
    onStatusChange?: (status: AutosaveStatus) => void;
    mode?: "auto" | "manual";
}) {
    const {
        promptId,
        version,
        items,
        onVersionChange,
        onConflict,
        onStatusChange,
        mode = "auto",
    } = opts;

    const versionRef = useRef(version);
    useEffect(() => {
        versionRef.current = version;
    }, [version]);

    const conflictRef = useRef<typeof onConflict>();
    useEffect(() => {
        conflictRef.current = onConflict;
    }, [onConflict]);

    const mountedRef = useRef(false);
    useEffect(() => {
        mountedRef.current = true;
    }, []);

    const lastHashRef = useRef<string>("");
    const itemsHash = useMemo(() => JSON.stringify(items), [items]);

    const notifyStatus = useCallback(
        (status: AutosaveStatus) => {
            onStatusChange?.(status);
        },
        [onStatusChange]
    );

    const saveFn = useCallback(
        async (payload: { items: QaItem[] }) => {
            if (!promptId) return;
            if (!mountedRef.current) return;

            notifyStatus("saving");

            try {
                const res = await patchFaqSection({
                    promptId,
                    version: versionRef.current,
                    data: { steps: payload.items }, // se mantiene igual
                });

                if (res?.conflict) {
                    notifyStatus("error");
                    // toast.warning(
                    //     "Las preguntas frecuentes se actualizaron en otra ventana o sesión. Cargamos la última versión del servidor. Revisa los cambios antes de seguir editando."
                    // );
                    conflictRef.current?.(res.data);
                    return;
                }

                if (res?.ok && res?.data?.version) {
                    versionRef.current = res.data.version;
                    onVersionChange(res.data.version);
                    notifyStatus("saved");
                } else {
                    notifyStatus("error");
                    toast.error("No se pudo guardar los cambios de Preguntas frecuentes.");
                }
            } catch (err) {
                console.error("[useFaqAutosave] Error al guardar:", err);
                notifyStatus("error");
                toast.error("Error al guardar automáticamente las Preguntas frecuentes.");
            }
        },
        [promptId, onVersionChange, notifyStatus]
    );

    const runSave = useMemo(() => createDebounced(saveFn, 700), [saveFn]);

    // Autosave solo si mode === "auto"
    useEffect(() => {
        if (mode === "manual") return;
        if (!promptId) return;

        if (lastHashRef.current === itemsHash) return;
        lastHashRef.current = itemsHash;

        runSave({ items });

        return () => {
            runSave.cancel?.();
        };
    }, [itemsHash, items, mode, promptId, runSave]);

    const forceSave = useCallback(async () => {
        if (!promptId) return;
        lastHashRef.current = itemsHash;
        await saveFn({ items });
    }, [promptId, items, itemsHash, saveFn]);

    return { forceSave };
}