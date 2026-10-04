/**
 * `actions/guia-publica-actions.ts` sin servidor: arma la guía con las MISMAS
 * piezas que la acción de verdad (`GUIAS_PUBLICADAS` y `laGuiaDe`), sin la
 * introducción editada ni el contacto, que salen de la base.
 */
import { laGuiaDe } from "@/lib/guia-de-modulo";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

export async function laGuiaPublicaAction(modulo: string) {
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
