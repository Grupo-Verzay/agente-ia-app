'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pin, PinOff, Loader2, Maximize2, Minimize2 } from "lucide-react";
import IframeRenderer from "@/components/custom/IframeRenderer";
import { cn } from "@/lib/utils";
import { useModuleStore } from "@/stores/modules/useModuleStore";
import {
    getUserIntegrations,
    createUserIntegration,
    deleteUserIntegration,
} from "@/actions/user-integration-actions";

// Copiloto de IA embebido (LibreChat). Por defecto apunta al copiloto de la
// plataforma; se puede sobreescribir la URL por módulo con el query param `u`
// (ej. copiloto propio de un reseller), igual que el patrón de /canva.
const DEFAULT_COPILOT_URL = "https://copiloto.ia-app.com";
const COPILOT_URL_PARAM = "u";
// Nombre de la "integración" que representa el Copiloto fijado como pestaña en
// Chats. Reusa el sistema de integraciones (una integración = una pestaña en el
// chat), así el cliente puede fijar/quitar el Copiloto de sus Chats sin tocar
// nada del módulo de Chats.
const PIN_NAME = "Copiloto";

const Loading = () => (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Cargando copiloto...
    </div>
);

const CopilotoInner = () => {
    const searchParams = useSearchParams();
    const url = searchParams.get(COPILOT_URL_PARAM)?.trim() || DEFAULT_COPILOT_URL;

    const { userIntegrations, setUserIntegrations } = useModuleStore();
    const [busy, setBusy] = useState(false);

    // Pantalla completa (inmersivo): el contenedor ocupa toda la pantalla; se
    // sale con Esc o el mismo botón.
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void containerRef.current?.requestFullscreen?.();
    };

    // Sincroniza la lista real de integraciones al entrar, para saber con certeza
    // si el Copiloto ya está fijado (y no crear duplicados).
    useEffect(() => {
        let active = true;
        getUserIntegrations().then((res) => {
            if (active && res.success) setUserIntegrations(res.data);
        });
        return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pinned = useMemo(
        () => userIntegrations.find((i) => i.name === PIN_NAME || i.url === url),
        [userIntegrations, url],
    );

    const togglePin = async () => {
        if (busy) return;
        setBusy(true);
        try {
            if (pinned) {
                const res = await deleteUserIntegration(pinned.id);
                if (res.success) {
                    setUserIntegrations(userIntegrations.filter((i) => i.id !== pinned.id));
                    toast.success("Copiloto quitado de tus Chats");
                } else {
                    toast.error("No se pudo quitar");
                }
            } else {
                const res = await createUserIntegration({ name: PIN_NAME, url });
                if (res.success && res.item) {
                    setUserIntegrations([...userIntegrations, res.item]);
                    toast.success("Copiloto fijado en tus Chats");
                } else {
                    toast.error(res.error ?? "No se pudo fijar");
                }
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
            <IframeRenderer url={url} />
            {/* Controles flotantes, a la izquierda del ícono nativo de LibreChat
                (misma altura, sin encimarse). Estilo nativo tipo selector de modelos. */}
            <div className="absolute right-[52px] top-2 z-20 flex items-center gap-2">
                {/* Fijar / Quitar de Chats (grande, primero — como el selector a la izquierda) */}
                <button
                    type="button"
                    onClick={togglePin}
                    disabled={busy}
                    title={pinned ? "Quitar el Copiloto de tus Chats" : "Mostrar el Copiloto como pestaña en tus Chats"}
                    className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background px-3.5 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-60",
                        pinned ? "text-muted-foreground" : "text-foreground",
                    )}
                >
                    {busy
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : pinned
                            ? <PinOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            : <Pin className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                    {pinned ? "Quitar de Chats" : "Fijar en Chats"}
                </button>
                {/* Pantalla completa (chico, junto al ícono nativo) */}
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background text-foreground transition-colors hover:bg-accent"
                >
                    {isFullscreen
                        ? <Minimize2 className="h-4 w-4" />
                        : <Maximize2 className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
};

export const MainCopiloto = () => (
    <Suspense fallback={<Loading />}>
        <CopilotoInner />
    </Suspense>
);
