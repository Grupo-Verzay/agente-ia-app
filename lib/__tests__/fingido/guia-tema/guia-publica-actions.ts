/**
 * `actions/guia-publica-actions.ts` sin servidor: arma la guía con las MISMAS
 * piezas que la acción de verdad (`GUIAS_PUBLICADAS` y `laGuiaDe`), sin la
 * introducción editada ni el contacto, que salen de la base.
 */
import { laGuiaDe } from "@/lib/guia-de-modulo";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

export async function laGuiaPublicaAction(modulo: string) {
    // Lo que tarda la red, si el banco lo pide (`window.__esperaDeLaGuia`, en
    // ms): la guía llega DESPUÉS de pintar «Cargando la guía…», como en la App.
    const espera = Number((globalThis as { __esperaDeLaGuia?: number }).__esperaDeLaGuia ?? 0);
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    const publicada = GUIAS_PUBLICADAS.find((g) => g.modulo === modulo);
    if (!publicada) return null;
    const guia = laGuiaDe(modulo, publicada.contenido);
    return {
        modulo,
        nombre: publicada.contenido.titulo,
        carpeta: guia.carpeta,
        video: guia.video,
        portada: guia.portada,
        introduccion: {
            titulo: publicada.contenido.titulo,
            subtitulo: publicada.contenido.subtitulo,
            descripcion: publicada.contenido.descripcion,
        },
        contactoHref: "https://wa.me/573000000000",
        secciones: [...guia.secciones],
    };
}
