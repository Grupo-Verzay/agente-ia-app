"use server";

import { elContactoDeLaGuia } from "@/lib/contacto-de-la-guia.server";
import { laGuiaDe, type Seccion } from "@/lib/guia-de-modulo";
import { elNombreDeLaGuia, esModuloConGuia, type Introduccion } from "@/lib/introduccion-de-la-guia";
import { laIntroduccionPublica } from "@/lib/introduccion-publica.server";
import { GUIAS_PUBLICADAS } from "@/lib/tutoriales-del-modulo";

/**
 * Una guía pública ENTERA, para pintarla dentro de la landing
 * (`/inicio#tutoriales/<categoria>/<modulo>`), sin sacar al visitante a
 * `/guia/<modulo>`.
 *
 * PÚBLICA A PROPÓSITO: no pregunta sesión porque la landing no la tiene, y no
 * devuelve nada que no sirva ya sin sesión la página `/guia/<modulo>` —el
 * contenido del código, la introducción editada y el enlace de contacto—. Un
 * módulo que no está publicado contesta `null`.
 *
 * Se pide al ABRIR una guía, no al cargar la landing: las diecinueve guías con
 * sus pasos pesan cientos de KB y la landing no puede llevarlas a cuestas.
 */
export type GuiaPublica = {
    modulo: string;
    /** El nombre del módulo («Leads»), el de «Módulo X». */
    nombre: string;
    /** La carpeta de la guía (`/guia/<modulo>`): de ahí cuelgan las capturas. */
    carpeta: string;
    video: string;
    portada: string;
    introduccion: Introduccion;
    contactoHref: string;
    secciones: Seccion[];
};

export async function laGuiaPublicaAction(modulo: string): Promise<GuiaPublica | null> {
    const publicada = GUIAS_PUBLICADAS.find((g) => g.modulo === modulo);
    if (!publicada || !esModuloConGuia(modulo)) return null;
    const guia = laGuiaDe(modulo, publicada.contenido);
    const [introduccion, contactoHref] = await Promise.all([
        laIntroduccionPublica(modulo, {
            titulo: publicada.contenido.titulo,
            subtitulo: publicada.contenido.subtitulo,
            descripcion: publicada.contenido.descripcion,
        }),
        elContactoDeLaGuia(modulo),
    ]);
    return {
        modulo,
        nombre: elNombreDeLaGuia(modulo),
        carpeta: guia.carpeta,
        video: guia.video,
        portada: guia.portada,
        introduccion,
        contactoHref,
        secciones: [...guia.secciones],
    };
}
