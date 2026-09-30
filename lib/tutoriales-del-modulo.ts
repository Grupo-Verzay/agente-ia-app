/**
 * La ventana «Tutoriales del módulo» (el botón «Ver tutoriales» de la barra de
 * arriba): qué tarjetas salen y cómo se pinta su botón.
 *
 * Puro: lo importan la acción de servidor (`getGuidesForPath`) y la barra.
 *
 * Las tarjetas salen de DOS sitios, y los dos cuentan igual:
 *
 * 1. Las que un administrador guarda a mano en Documentación › Administrador
 *    tutoriales (tabla `GuidesUrl`).
 * 2. **Las guías publicadas en `/guia/<modulo>`**, registradas AQUÍ, en
 *    `TUTORIALES_DE_LAS_GUIAS`. Quien publica una guía nueva añade su fila en
 *    este fichero, en el mismo PR: así la tarjeta sale en su pantalla el día
 *    que la guía se despliega, sin un paso manual en el panel. El banco
 *    (`scripts/banco-tutoriales-del-modulo.sh`) falla si una carpeta de
 *    `app/guia/` no tiene su fila.
 */
import { GUIA_CATALOGO } from "@/lib/guia-catalogo";
import { GUIA_DIAGRAMAS } from "@/lib/guia-diagramas";
import type { Contenido } from "@/lib/guia-de-modulo";
import { GUIA_LEADS } from "@/lib/guia-leads";
import { GUIA_REUNIONES } from "@/lib/guia-reuniones";

/** Lo que pinta una tarjeta. La fila de `GuidesUrl` tiene esto y más. */
export type TutorialDelModulo = {
    id: string;
    path: string;
    title: string;
    description: string | null;
    url: string;
};

/**
 * El botón de cada tarjeta: el MISMO azul que el botón de crear
 * (`BotonDeCrear`, `bg-blue-600`), pero en estilo secundario —fondo blanco y
 * borde de color—, no un bloque sólido. Vive en `lib/` y Tailwind lo mira.
 */
export const BOTON_VER_TUTORIAL =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-white px-4 " +
    "text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 " +
    "dark:border-blue-500 dark:bg-background dark:text-blue-400 dark:hover:bg-blue-950";

export const TEXTO_DEL_BOTON = "Ver tutorial";

/** Una guía publicada y la pantalla (ruta del menú) donde sale su tarjeta. */
type GuiaPublicada = { modulo: string; ruta: string; contenido: Contenido };

/**
 * Las guías de `/guia/<modulo>`. **Una fila por carpeta de `app/guia/`.**
 * `ruta` es la pantalla del módulo (la de `navigationRoutes`): la tarjeta sale
 * ahí y en sus subpantallas.
 */
export const GUIAS_PUBLICADAS: readonly GuiaPublicada[] = [
    { modulo: "leads", ruta: "/sessions", contenido: GUIA_LEADS },
    { modulo: "catalogo", ruta: "/mis-catalogo", contenido: GUIA_CATALOGO },
    { modulo: "diagramas", ruta: "/diagramas", contenido: GUIA_DIAGRAMAS },
    { modulo: "reuniones", ruta: "/reuniones", contenido: GUIA_REUNIONES },
];

/** Las tarjetas de las guías publicadas: título, descripción y enlace. */
export const TUTORIALES_DE_LAS_GUIAS: readonly TutorialDelModulo[] = GUIAS_PUBLICADAS.map((g) => ({
    id: `guia-${g.modulo}`,
    path: g.ruta,
    title: `Guía de ${g.contenido.titulo}`,
    description: g.contenido.subtitulo,
    url: `/guia/${g.modulo}`,
}));

/** La dirección sin dominio ni barra final, para comparar dos enlaces. */
function laDireccion(url: string): string {
    const limpia = (url || "").trim();
    try {
        return new URL(limpia, "http://x").pathname.replace(/\/+$/, "") || "/";
    } catch {
        return limpia;
    }
}

/**
 * Junta las tarjetas de la base con las de las guías que apliquen a las rutas
 * candidatas. Si alguien ya guardó a mano la misma guía, no sale dos veces:
 * manda la de la base (se pudo retocar su texto).
 */
export function juntarLosTutoriales(
    deLaBase: readonly TutorialDelModulo[],
    candidatos: readonly string[],
): TutorialDelModulo[] {
    const yaEstan = new Set(deLaBase.map((t) => laDireccion(t.url)));
    const deLasGuias = TUTORIALES_DE_LAS_GUIAS.filter(
        (t) => candidatos.includes(t.path) && !yaEstan.has(laDireccion(t.url)),
    );
    // El más específico primero: si hay uno de la pantalla exacta, ese encabeza.
    return [...deLaBase, ...deLasGuias].sort((a, b) => b.path.length - a.path.length);
}

