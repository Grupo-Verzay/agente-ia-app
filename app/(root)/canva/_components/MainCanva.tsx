'use client'

import IframeRenderer from "@/components/custom/IframeRenderer";
import { useModuleStore } from "@/stores/modules/useModuleStore";

export const MainCanva = () => {
    const { canvaUrl } = useModuleStore();
    if (!canvaUrl) return 'Cargando...'

    return (
        <div data-full-bleed className="h-full w-full">
            <IframeRenderer url={canvaUrl} />
        </div>
    );
}
