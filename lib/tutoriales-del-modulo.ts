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
import { GUIA_NOTAS } from "@/lib/guia-notas";
import { GUIA_GOOGLE_SHEETS } from "@/lib/guia-google-sheets";
import { GUIA_INTEGRACIONES } from "@/lib/guia-integraciones";
import { GUIA_AGENTE_IA } from "@/lib/guia-agente-ia";
import { GUIA_USUARIOS } from "@/lib/guia-usuarios";
import { GUIA_RESPUESTAS_RAPIDAS } from "@/lib/guia-respuestas-rapidas";
import { GUIA_MACROS } from "@/lib/guia-macros";

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

/**
 * La descripción de una tarjeta: **«Aprende a [acción concreta] en la
 * plataforma»**, con un beneficio para el cliente, y como mucho
 * `TOPE_DE_LA_DESCRIPCION` caracteres para que quepa en UNA línea de la
 * tarjeta. Nada de textos genéricos repetidos («Recorrido completo del módulo
 * de X con video explicativo y guías»): dicen lo mismo en todas las tarjetas.
 *
 * La regla es una y la usan las cuatro puertas: las guías publicadas (abajo),
 * crear y editar un tutorial a mano (`guide-actions`), y el formulario de
 * Documentación › Administrador tutoriales, que la enseña mientras se escribe.
 */
export const TOPE_DE_LA_DESCRIPCION = 75;
export const COMIENZO_DE_LA_DESCRIPCION = "Aprende a ";
export const FINAL_DE_LA_DESCRIPCION = " en la plataforma";

/**
 * Por qué una descripción NO vale, o `null` si vale. Vacía vale: la
 * descripción es opcional y una tarjeta sin ella se pinta igual.
 */
export function porQueNoValeLaDescripcion(texto: string | null | undefined): string | null {
    const t = (texto ?? "").trim();
    if (!t) return null;
    const largo = [...t].length;
    if (largo > TOPE_DE_LA_DESCRIPCION) {
        return `La descripción tiene ${largo} caracteres y el máximo son ${TOPE_DE_LA_DESCRIPCION}: así cabe en una sola línea de la tarjeta.`;
    }
    const cuerpo = t.slice(COMIENZO_DE_LA_DESCRIPCION.length, t.length - FINAL_DE_LA_DESCRIPCION.length).trim();
    if (!t.startsWith(COMIENZO_DE_LA_DESCRIPCION) || !t.endsWith(FINAL_DE_LA_DESCRIPCION) || !cuerpo) {
        return `La descripción tiene que decir «${COMIENZO_DE_LA_DESCRIPCION}[qué aprende]${FINAL_DE_LA_DESCRIPCION}».`;
    }
    return null;
}

/** Cuántos caracteres cuenta la regla (los emojis y las tildes cuentan uno). */
export function largoDeLaDescripcion(texto: string | null | undefined): number {
    return [...(texto ?? "").trim()].length;
}

/**
 * Una guía publicada, la pantalla (ruta del menú) donde sale su tarjeta y la
 * descripción de su tarjeta (con la regla de arriba). La descripción es de la
 * TARJETA, no el subtítulo de la guía: el subtítulo describe la página, la
 * tarjeta dice qué se aprende en ella.
 */
type GuiaPublicada = { modulo: string; ruta: string; contenido: Contenido; tarjeta: string };

/**
 * Las guías de `/guia/<modulo>`. **Una fila por carpeta de `app/guia/`.**
 * `ruta` es la pantalla del módulo (la de `navigationRoutes`): la tarjeta sale
 * ahí y en sus subpantallas.
 */
export const GUIAS_PUBLICADAS: readonly GuiaPublicada[] = [
    {
        modulo: "leads",
        ruta: "/sessions",
        contenido: GUIA_LEADS,
        tarjeta: "Aprende a organizar y filtrar tus contactos de WhatsApp en la plataforma",
    },
    {
        modulo: "catalogo",
        ruta: "/mis-catalogo",
        contenido: GUIA_CATALOGO,
        tarjeta: "Aprende a crear y compartir tu catálogo de productos en la plataforma",
    },
    {
        modulo: "diagramas",
        ruta: "/diagramas",
        contenido: GUIA_DIAGRAMAS,
        tarjeta: "Aprende a crear y gestionar tus diagramas de flujo en la plataforma",
    },
    {
        modulo: "reuniones",
        ruta: "/reuniones",
        contenido: GUIA_REUNIONES,
        tarjeta: "Aprende a hacer videollamadas con tu equipo y clientes en la plataforma",
    },
    {
        modulo: "notas",
        ruta: "/notas",
        contenido: GUIA_NOTAS,
        tarjeta: "Aprende a escribir, organizar y compartir tus notas en la plataforma",
    },
    {
        modulo: "google-sheets",
        ruta: "/google-sheets",
        contenido: GUIA_GOOGLE_SHEETS,
        tarjeta: "Aprende a vincular y consultar tu hoja de Google Sheets en la plataforma",
    },
    {
        modulo: "integraciones",
        ruta: "/integraciones",
        contenido: GUIA_INTEGRACIONES,
        tarjeta: "Aprende a abrir tus apps web dentro de tus chats en la plataforma",
    },
    {
        modulo: "agente-ia",
        ruta: "/ia",
        contenido: GUIA_AGENTE_IA,
        tarjeta: "Aprende a entrenar tu agente de IA paso a paso en la plataforma",
    },
    {
        modulo: "usuarios",
        ruta: "/equipo",
        contenido: GUIA_USUARIOS,
        tarjeta: "Aprende a crear tu equipo y repartir los chats en la plataforma",
    },
    {
        modulo: "respuestas-rapidas",
        ruta: "/auto-replies",
        contenido: GUIA_RESPUESTAS_RAPIDAS,
        tarjeta: "Aprende a crear y usar tus respuestas rápidas en la plataforma",
    },
    {
        modulo: "macros",
        ruta: "/macros",
        contenido: GUIA_MACROS,
        tarjeta: "Aprende a automatizar tus chats con acciones de un clic en la plataforma",
    },
];

/** Las tarjetas de las guías publicadas: título, descripción y enlace. */
export const TUTORIALES_DE_LAS_GUIAS: readonly TutorialDelModulo[] = GUIAS_PUBLICADAS.map((g) => ({
    id: `guia-${g.modulo}`,
    path: g.ruta,
    title: `Guía de ${g.contenido.titulo}`,
    description: g.tarjeta,
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

