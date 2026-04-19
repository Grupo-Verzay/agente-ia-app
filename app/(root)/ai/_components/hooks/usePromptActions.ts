// app/(root)/ai/_components/hooks/usePromptActions.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publishPrompt } from "@/actions/system-prompt-actions";

type ConflictPayload = any;

export function usePromptActions(opts: {
    promptId: string;
    version: number;
    publishedBy?: string;
    onVersionChange: (next: number) => void;
    onConflict?: (serverState: ConflictPayload) => void;
    revalidatePath?: string;
}) {
    const { promptId, version, publishedBy, onVersionChange, onConflict, revalidatePath } = opts;

    const [loading, setLoading] = useState<null | "saving" | "publishing" | "reverting">(null);
    const [error, setError] = useState<string | null>(null);

    // 👇 mantener la versión viva en un ref
    const versionRef = useRef(version);
    useEffect(() => {
        versionRef.current = version;
    }, [version]);

    const handleConflict = useCallback((serverState: any) => {
        onConflict?.(serverState);
        // toast.info(
        //     "Este prompt se actualizó en otra pestaña o usuario. Cargamos la última versión del servidor."
        // );
        // setError("Conflicto de versión: se detectaron cambios en el servidor.");
    }, [onConflict]);

    const handleOk = useCallback((nextVersion?: number) => {
        if (typeof nextVersion === "number") onVersionChange(nextVersion);
        setError(null);
    }, [onVersionChange]);

    const publish = useCallback(async (note?: string) => {
        if (!promptId || !publishedBy) return;
        setLoading("publishing"); setError(null);
        try {
            const res = await publishPrompt({
                promptId,
                version: versionRef.current,
                publishedBy,
                note,
                revalidate: revalidatePath,
            });

            if (!res.ok) {
                return setError("No se pudo publicar.");
            }

            handleOk(res.data?.prompt?.version);
        } catch (e: any) {
            setError(e?.message ?? "Error al publicar.");
        } finally {
            setLoading(null);
        }
    }, [promptId, publishedBy, revalidatePath, handleOk]);


    return {
        loading,
        error,
        publish,
    };
}
