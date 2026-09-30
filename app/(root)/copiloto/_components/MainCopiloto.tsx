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
import {
    BOTONES_DE_LA_PLATAFORMA,
    BOTON_FIJAR,
    BOTON_PANTALLA_COMPLETA,
    CAJA_DEL_COPILOTO,
    MANDOS_DEL_COPILOTO,
    MARCO_DEL_COPILOTO,
    NOMBRE_DE_LA_PESTANA,
    PARAMETRO_DEL_COPILOTO,
    ROTULO_DE_FIJAR,
    TITULO_DEL_MARCO,
    hayPantallaCompleta,
    laUrlDelCopiloto,
} from "@/lib/copiloto";
import { laLlaveDelNombre, laUrlQueSeAbre } from "@/lib/integraciones";

// Copiloto de IA embebido (LibreChat). Por defecto apunta al copiloto de la
// plataforma; un módulo puede cambiarlo con `?u=` (el copiloto propio de un
// reseller), igual que /canva. Qué dirección se abre, dónde van los dos
// botones según el ancho y cuándo se ofrece la pantalla completa lo decide
// `lib/copiloto.ts`.
// La pestaña que «Fijar en Chats» pone en cada conversación es una
// INTEGRACIÓN del cliente (una integración = una pestaña en el chat): así se
// fija y se quita sin tocar nada del módulo de Chats.

const Loading = () => (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Cargando copiloto...
    </div>
);

const CopilotoInner = () => {
    const searchParams = useSearchParams();
    // `?u=` llega de un enlace que cualquiera puede mandar: solo se embebe si es
    // una dirección web, con la MISMA regla que las apps de Integrar URLs. Con
    // `javascript:` ahí, el marco ejecutaba ese código en la plataforma.
    const pedida = searchParams.get(PARAMETRO_DEL_COPILOTO);
    const url = laUrlDelCopiloto(pedida);
    useEffect(() => {
        if (pedida?.trim() && !laUrlQueSeAbre(pedida)) {
            console.warn("[copiloto] la dirección pedida no se puede abrir; se abre el copiloto de la plataforma", { pedida: pedida.slice(0, 80) });
        }
    }, [pedida, url]);

    const { userIntegrations, setUserIntegrations } = useModuleStore();
    const [busy, setBusy] = useState(false);

    // Pantalla completa (inmersivo): el contenedor ocupa toda la pantalla; se
    // sale con Esc o el mismo botón.
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Solo se ofrece si el navegador la deja: en un iPhone un `<div>` no tiene
    // `requestFullscreen`, y el botón no hacía nada al pulsarlo.
    const [conPantallaCompleta, setConPantallaCompleta] = useState(false);
    useEffect(() => {
        setConPantallaCompleta(hayPantallaCompleta(document, containerRef.current));
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const toggleFullscreen = () => {
        const cambio = document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen();
        // Un «no» del navegador no puede quedarse en una promesa rechazada muda.
        cambio?.catch((error: unknown) => {
            console.warn("[copiloto] el navegador no dejó cambiar la pantalla completa", error);
            toast.error("El navegador no dejó abrir la pantalla completa.");
        });
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

    // El nombre se compara como lo compara Integrar URLs al guardar (sin
    // mayúsculas ni tildes): con «copiloto» ya puesto a mano, fijar chocaría
    // con «ya tienes una app llamada Copiloto» en vez de ofrecer quitarla.
    const pinned = useMemo(
        () => userIntegrations.find(
            (i) => laLlaveDelNombre(i.name) === laLlaveDelNombre(NOMBRE_DE_LA_PESTANA) || i.url === url,
        ),
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
                const res = await createUserIntegration({ name: NOMBRE_DE_LA_PESTANA, url });
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

    const fijar = pinned ? BOTONES_DE_LA_PLATAFORMA.quitar : BOTONES_DE_LA_PLATAFORMA.fijar;
    const pantalla = isFullscreen ? BOTONES_DE_LA_PLATAFORMA.salirDePantallaCompleta : BOTONES_DE_LA_PLATAFORMA.pantallaCompleta;

    return (
        <div ref={containerRef} className={CAJA_DEL_COPILOTO} data-pantalla-del-copiloto>
            {/* Los dos botones de la plataforma. Flotan a la izquierda del botón
                de más a la derecha del copiloto, a la altura de su cabecera,
                mientras el copiloto tenga sitio; en un teléfono van en su fila,
                encima (ver `lib/copiloto.ts`). */}
            <div className={MANDOS_DEL_COPILOTO} data-mandos-del-copiloto>
                <button
                    type="button"
                    onClick={togglePin}
                    disabled={busy}
                    title={fijar.titulo}
                    aria-label={fijar.titulo}
                    data-mando="fijar"
                    className={cn(BOTON_FIJAR, pinned ? "text-muted-foreground" : "text-foreground")}
                >
                    {busy
                        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        : pinned
                            ? <PinOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            : <Pin className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
                    <span className={ROTULO_DE_FIJAR}>{fijar.rotulo}</span>
                </button>
                {conPantallaCompleta && (
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        title={pantalla.titulo}
                        aria-label={pantalla.titulo}
                        data-mando="pantalla-completa"
                        className={BOTON_PANTALLA_COMPLETA}
                    >
                        {isFullscreen
                            ? <Minimize2 className="h-4 w-4" />
                            : <Maximize2 className="h-4 w-4" />}
                    </button>
                )}
            </div>
            <div className={MARCO_DEL_COPILOTO} data-marco-del-copiloto>
                <IframeRenderer url={url} title={TITULO_DEL_MARCO} />
            </div>
        </div>
    );
};

export const MainCopiloto = () => (
    <Suspense fallback={<Loading />}>
        <CopilotoInner />
    </Suspense>
);
