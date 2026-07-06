'use client'

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import IframeRenderer from "@/components/custom/IframeRenderer";
import { useModuleStore } from "@/stores/modules/useModuleStore";
import { CANVA_URL_PARAM } from "@/lib/canva-embed";

const Loading = () => (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Cargando...
    </div>
);

const CanvaInner = () => {
    const searchParams = useSearchParams();
    // La URL a embeber viene en el query param `u` (stateless). Si no está,
    // caemos al store por compatibilidad con navegaciones antiguas del sidebar.
    const { canvaUrl } = useModuleStore();
    const url = searchParams.get(CANVA_URL_PARAM) || canvaUrl;

    if (!url) return <Loading />;
    return <IframeRenderer url={url} />;
};

export const MainCanva = () => (
    <Suspense fallback={<Loading />}>
        <CanvaInner />
    </Suspense>
);
