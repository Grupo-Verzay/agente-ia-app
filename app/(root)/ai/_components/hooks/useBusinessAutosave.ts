// useBusinessAutosave.ts
"use client";

import { patchBusinessAndFirma } from "@/actions/system-prompt-actions";
import { FormValues } from "@/types/agentAi";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type FirmaPayload = {
    firmaEnabled: boolean;
    firmaText: string;
    firmaName: string;
};

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

export function useBusinessAutosave(opts: {
    form: UseFormReturn<FormValues>;
    promptId: string;
    version: number;
    onVersionChange: (nextVersion: number) => void;
    onConflict?: (serverState: any) => void;
    onStatusChange?: (status: AutosaveStatus) => void;
    mode?: "auto" | "manual";
    /**
     * La firma se edita en la pestaña de negocio pero se almacena en `extras`.
     * Se persiste junto con el negocio en la misma transacción.
     */
    firma?: FirmaPayload;
}) {
    const {
        form,
        promptId,
        version,
        onVersionChange,
        onConflict,
        onStatusChange,
        mode = "auto",
        firma,
    } = opts;

    const versionRef = useRef(version);
    useEffect(() => {
        versionRef.current = version;
    }, [version]);

    // Mantén la firma en un ref para que forceSave/saveFn siempre usen el valor actual.
    const firmaRef = useRef<FirmaPayload | undefined>(firma);
    useEffect(() => {
        firmaRef.current = firma;
    }, [firma]);

    const notifyStatus = useCallback((status: AutosaveStatus) => {
        onStatusChange?.(status);
    }, [onStatusChange]);

    // 👇 Lógica REAL de guardado (sin debounce)
    const saveFn = useCallback(
        async (data: FormValues) => {
            const firmaPayload = firmaRef.current;
            const hasFirma = !!firmaPayload?.firmaName?.trim();
            // Guardamos si hay nombre de negocio o si hay firma que persistir.
            if ((!data?.nombre || !data.nombre.trim()) && !hasFirma) return;
            if (!promptId) return;

            notifyStatus("saving");

            try {
                const dto = {
                    nombre: data.nombre ?? "",
                    sector: data.sector ?? "",
                    ubicacion: data.ubicacion ?? "",
                    horarios: data.horarios ?? "",
                    telefono: data.telefono ?? "",
                    email: data.email ?? "",
                    sitio: data.sitio ?? "",
                    facebook: data.facebook ?? "",
                    instagram: data.instagram ?? "",
                    tiktok: data.tiktok ?? "",
                    youtube: data.youtube ?? "",
                    linkedin: data.linkedin ?? "",
                    twitter: data.twitter ?? "",
                    telegram: data.telegram ?? "",
                    notas: data.notas ?? "",
                };

                const res = await patchBusinessAndFirma({
                    promptId,
                    version: versionRef.current,
                    business: dto,
                    firma: {
                        firmaEnabled: firmaPayload?.firmaEnabled ?? false,
                        firmaText: firmaPayload?.firmaText ?? "",
                        firmaName: firmaPayload?.firmaName ?? "",
                    },
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
