import type { Metadata } from "next";

import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

/**
 * El VÍDEO DE VENTAS (`/demo`), con el mismo sistema que la documentación
 * pública (`/guia`):
 *
 * - **Pública a propósito**: está en el middleware, porque la abre un lead que
 *   todavía no tiene cuenta. No lee nada de la base: todo sale de
 *   `lib/video-de-ventas.ts` y de `public/demo/`.
 * - **No se indexa**: `robots` aquí y `X-Robots-Tag` en la cabecera
 *   (`next.config.js`), que también alcanza al vídeo. Se reparte por enlace.
 * - Vive fuera de `(root)`, así que lleva su propio contenedor que se desplaza
 *   (`PANTALLA_PUBLICA_QUE_SE_DESPLAZA`).
 */
export const metadata: Metadata = {
    title: "Verzay en acción",
    description: "Una conversación de WhatsApp atendida por la IA de Verzay, de principio a fin.",
    // La miniatura al compartir el enlace: la portada del vídeo (el logo y el
    // botón de reproducir), no un fotograma negro.
    openGraph: {
        title: "Verzay en acción",
        description: "Una conversación de WhatsApp atendida por la IA de Verzay, de principio a fin.",
        images: [{ url: "/demo/verzay-demo.jpg", width: 1920, height: 1080, alt: "Verzay · reproducir el vídeo" }],
        type: "video.other",
    },
    robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
    },
};

export default function LayoutDeLaDemo({ children }: { children: React.ReactNode }) {
    return (
        <main data-demo className={`bg-slate-50 text-slate-900 ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
            {children}
        </main>
    );
}
