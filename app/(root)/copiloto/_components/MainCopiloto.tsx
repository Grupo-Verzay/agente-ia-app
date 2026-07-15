'use client'

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pin, PinOff, Loader2 } from "lucide-react";
import IframeRenderer from "@/components/custom/IframeRenderer";
import { Button } from "@/components/ui/button";
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
        <div className="flex h-full flex-col">
            {/* Barra fina con el botón de fijar/quitar en Chats */}
            <div className="flex shrink-0 items-center justify-end border-b bg-card px-3 py-1.5">
                <Button
                    size="sm"
                    variant={pinned ? "secondary" : "default"}
                    onClick={togglePin}
                    disabled={busy}
                    className="h-8 gap-1.5"
                    title={pinned ? "Quitar el Copiloto de tus Chats" : "Mostrar el Copiloto como pestaña en tus Chats"}
                >
                    {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    {pinned ? "Quitar de Chats" : "Fijar en Chats"}
                </Button>
            </div>
            <div className="min-h-0 flex-1">
                <IframeRenderer url={url} />
            </div>
        </div>
    );
};

export const MainCopiloto = () => (
    <Suspense fallback={<Loading />}>
        <CopilotoInner />
    </Suspense>
);
