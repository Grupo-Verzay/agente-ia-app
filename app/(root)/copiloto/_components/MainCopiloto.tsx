'use client'

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import IframeRenderer from "@/components/custom/IframeRenderer";

// Copiloto de IA embebido (LibreChat). Por defecto apunta al copiloto de la
// plataforma; se puede sobreescribir la URL por módulo con el query param `u`
// (ej. para un copiloto propio de un reseller), igual que el patrón de /canva.
const DEFAULT_COPILOT_URL = "https://copiloto.ia-app.com";
const COPILOT_URL_PARAM = "u";

const Loading = () => (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Cargando copiloto...
    </div>
);

const CopilotoInner = () => {
    const searchParams = useSearchParams();
    const url = searchParams.get(COPILOT_URL_PARAM)?.trim() || DEFAULT_COPILOT_URL;
    return <IframeRenderer url={url} />;
};

export const MainCopiloto = () => (
    <Suspense fallback={<Loading />}>
        <CopilotoInner />
    </Suspense>
);
