/**
 * Las guías publicadas, tal como las necesita el centro de ayuda (`/ayuda`):
 * título, descripción de su tarjeta, enlace, categoría y los títulos de sus
 * secciones para el buscador.
 *
 * Sale de `GUIAS_PUBLICADAS` —la misma lista que pone las tarjetas de «Ver
 * tutoriales»—, así que una guía que se publica sale aquí sin tocar nada: su
 * categoría la deduce la ruta de su pantalla (`laCategoriaDeLaRuta`).
 *
 * Esto trae el contenido de las quince guías, así que se usa en el SERVIDOR y
 * a la pantalla le baja solo lo que pinta.
 */
import { laCategoriaDeLaRuta, type GuiaDeAyuda } from "@/lib/centro-de-ayuda";
import { elNombreDeLaGuia } from "@/lib/introduccion-de-la-guia";
import { GUIAS_PUBLICADAS, TUTORIALES_DE_LAS_GUIAS } from "@/lib/tutoriales-del-modulo";

/** Tope de lo que viaja por sección para el buscador: títulos, no el texto entero. */
const TOPE_DE_CLAVES = 600;

export function lasGuiasDelCentroDeAyuda(): GuiaDeAyuda[] {
    return GUIAS_PUBLICADAS.map((g) => {
        const tarjeta = TUTORIALES_DE_LAS_GUIAS.find((t) => t.id === `guia-${g.modulo}`);
        return {
            modulo: g.modulo,
            titulo: tarjeta?.title ?? `Guía de ${g.contenido.titulo}`,
            descripcion: g.tarjeta,
            nombre: elNombreDeLaGuia(g.modulo),
            subtitulo: g.contenido.subtitulo,
            url: tarjeta?.url ?? `/guia/${g.modulo}`,
            ruta: g.ruta,
            categoria: laCategoriaDeLaRuta(g.ruta),
            secciones: g.contenido.secciones.map((s) => ({
                slug: s.slug,
                titulo: s.titulo,
                // Lo que se mira además del título: su resumen y el nombre de
                // cada paso («Exportar a Excel», «Etiquetas»…), no su texto.
                claves: [s.resumen, ...s.pasos.map((p) => p.titulo)].filter(Boolean).join(" · ").slice(0, TOPE_DE_CLAVES),
            })),
        };
    });
}
