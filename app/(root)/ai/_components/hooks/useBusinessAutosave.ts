// useBusinessAutosave.ts
"use client";

import { patchBusinessSection } from "@/actions/system-prompt-actions";
import { FormValues } from "@/types/agentAi";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
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

export function useBusinessAutosave(opts: {
    form: UseFormReturn<FormValues>;
    promptId: string;
    version: number;
    onVersionChange: (nextVersion: number) => void;
    onConflict?: (serverState: any) => void;
    onStatusChange?: (status: AutosaveStatus) => void;
    mode?: "auto" | "manual";
}) {
    const {
        form,
        promptId,
        version,
        onVersionChange,
        onConflict,
        onStatusChange,
        mode = "auto",
    } = opts;

    const versionRef = useRef(version);
    useEffect(() => {
        versionRef.current = version;
    }, [version]);

    const notifyStatus = useCallback((status: AutosaveStatus) => {
        onStatusChange?.(status);
    }, [onStatusChange]);

    // 👇 Lógica REAL de guardado (sin debounce)
    const saveFn = useCallback(
        async (data: FormValues) => {
            // Si no hay nombre, no guardamos (como ya tenías)
            if (!data?.nombre || !data.nombre.trim()) return;
            if (!promptId) return;

            notifyStatus("saving");

            try {
                const dto = {
                    nombre: data.nombre ?? "",
                    sector: data.sector ?? "",
                    ubicacion: data.ubicacion ?? "",
                    horarios: data.horarios ?? "",
                    maps: data.maps ?? "",
                    telefono: data.telefono ?? "",
                    email: data.email ?? "",
                    sitio: data.sitio ?? "",
                    facebook: data.facebook ?? "",
                    instagram: data.instagram ?? "",
                    tiktok: data.tiktok ?? "",
                    youtube: data.youtube ?? "",
                    notas: data.notas ?? "",
                };

                const res = await patchBusinessSection({
                    promptId,
                    version: versionRef.current,
                    data: dto,
                });

                if (res?.conflict) {
                    notifyStatus("error");
                    // toast.warning(
                    //     "Este bloque de negocio se actualizó en otra ventana o sesión. Cargamos la última versión del servidor. Revisa los cambios antes de seguir editando."
                    // );
                    onConflict?.(res.data);
                    return;
                }

                if (res?.ok && res?.data?.version) {
                    versionRef.current = res.data.version;
                    onVersionChange(res.data.version);
                    notifyStatus("saved");
                } else {
                    notifyStatus("error");
                    toast.error("No se pudo guardar los cambios.");
                }
            } catch (err) {
                console.error("[useBusinessAutosave] Error al guardar:", err);
                notifyStatus("error");
                toast.error("Error al guardar automáticamente los cambios.");
            }
        },
        [notifyStatus, promptId, onConflict, onVersionChange]
    );

    // 👇 Versión con debounce, solo usada en modo "auto"
    const runSave = useMemo(() => {
        return createDebounced(saveFn, 700);
    }, [saveFn]);

    // 👇 Observamos el formulario
    const watched = form.watch();
    const watchedJson = useMemo(() => JSON.stringify(watched), [watched]);

    // Autosave solo si mode === "auto"
    useEffect(() => {
        if (mode === "manual") return;
        if (!promptId) return;

        runSave(watched as FormValues);

        return () => {
            runSave.cancel?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchedJson, mode, promptId, runSave]);

    // 👇 Guardado forzado (sin debounce), para usar desde el PromptToolbar
    const forceSave = useCallback(async () => {
        const current = form.getValues() as FormValues;
        await saveFn(current);
    }, [form, saveFn]);

    return { forceSave };
}
