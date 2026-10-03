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
import { GUIA_MIS_DATOS } from "@/lib/guia-mis-datos";
import { GUIA_GOOGLE_SHEETS } from "@/lib/guia-google-sheets";
import { GUIA_INTEGRACIONES } from "@/lib/guia-integraciones";
import { GUIA_AGENTE_IA } from "@/lib/guia-agente-ia";
import { GUIA_USUARIOS } from "@/lib/guia-usuarios";
import { GUIA_RESPUESTAS_RAPIDAS } from "@/lib/guia-respuestas-rapidas";
import { GUIA_AGENDA } from "@/lib/guia-agenda";
import { GUIA_MULTIAGENDA } from "@/lib/guia-multiagenda";
import { GUIA_EMBUDOS } from "@/lib/guia-embudos";
import { GUIA_CHATS } from "@/lib/guia-chats";
import { GUIA_CORREO } from "@/lib/guia-correo";
import { GUIA_FOLLOW_UPS } from "@/lib/guia-follow-ups";
import { GUIA_CALIFICACION } from "@/lib/guia-calificacion";
import { GUIA_MACROS } from "@/lib/guia-macros";
import { GUIA_FORMULARIOS } from "@/lib/guia-formularios";
import { GUIA_COPILOTO } from "@/lib/guia-copiloto";
import { GUIA_AI_IMAGENES } from "@/lib/guia-ai-imagenes";
import { GUIA_FINANZAS } from "@/lib/guia-finanzas";
import { GUIA_INFORMES } from "@/lib/guia-informes";
import { GUIA_LLAMADAS } from "@/lib/guia-llamadas";
import { GUIA_PRODUCTOS } from "@/lib/guia-productos";
import { GUIA_FLUJOS } from "@/lib/guia-flujos";
import { GUIA_RECORDATORIOS } from "@/lib/guia-recordatorios";
import { GUIA_CAMPANAS } from "@/lib/guia-campanas";
import { GUIA_TAREAS } from "@/lib/guia-tareas";
import { GUIA_ETIQUETAS } from "@/lib/guia-etiquetas";
import { GUIA_CONEXION } from "@/lib/guia-conexion";

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
 * Desde qué ancho de pantalla sale «Ver tutoriales» en la barra de arriba:
 * `sm` (640 px), el MISMO corte con el que esa barra deja los botones solo con
 * su icono. **En el teléfono no sale.**
 *
 * Allí la barra son ocho iconos en 360 px y no caben: el selector Chats ⇄
 * Correos acababa encima del botón rojo. Y no se pierde nada, porque «Ayuda»
 * (el centro de ayuda, `/ayuda`) está al lado y lleva a todas las guías, las
 * de esta pantalla incluidas. En escritorio y en tableta no cambia nada.
 */
export const ANCHO_DESDE_EL_QUE_SALEN_LOS_TUTORIALES_PX = 640;

/**
 * El botón «Ver tutoriales» de la barra: rojo, con su palabra. `hidden` hasta
 * `sm` y `inline-flex` desde ahí (el `inline-flex` de `Button` lo pisa el
 * `hidden`, que va después). Con `display: none` no ocupa sitio, así que el
 * selector Chats ⇄ Correos —que mide lo que hay a la derecha— gana ese ancho.
 */
export const BOTON_DE_TUTORIALES_EN_LA_BARRA =
    "hidden sm:inline-flex h-9 bg-[#FF0033] hover:bg-[#e60000] text-white font-semibold transition duration-200 uppercase";

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
        modulo: "mis-datos",
        ruta: "/my-data",
        contenido: GUIA_MIS_DATOS,
        tarjeta: "Aprende a darle a tu agente IA los datos de tu negocio en la plataforma",
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
    {
        modulo: "formularios",
        ruta: "/mis-formularios",
        contenido: GUIA_FORMULARIOS,
        tarjeta: "Aprende a crear formularios y recibir sus respuestas en la plataforma",
    },
    {
        modulo: "copiloto",
        ruta: "/copiloto",
        contenido: GUIA_COPILOTO,
        tarjeta: "Aprende a redactar mensajes y resolver dudas con IA en la plataforma",
    },
    {
        modulo: "ai-imagenes",
        ruta: "/ai-image",
        contenido: GUIA_AI_IMAGENES,
        tarjeta: "Aprende a crear anuncios de tu producto con IA en la plataforma",
    },
    {
        modulo: "finanzas",
        ruta: "/dashboard/finance",
        contenido: GUIA_FINANZAS,
        tarjeta: "Aprende a registrar ventas y gastos y ver tu balance en la plataforma",
    },
    {
        modulo: "informes",
        ruta: "/crm/dashboard",
        contenido: GUIA_INFORMES,
        tarjeta: "Aprende a leer los números de tu negocio en la plataforma",
    },
    {
        modulo: "llamadas",
        ruta: "/crm/llamadas",
        contenido: GUIA_LLAMADAS,
        tarjeta: "Aprende a llamar a tus clientes y revisar cada llamada en la plataforma",
    },
    {
        modulo: "productos",
        ruta: "/products",
        contenido: GUIA_PRODUCTOS,
        tarjeta: "Aprende a crear y organizar tus productos en la plataforma",
    },
    {
        modulo: "flujos",
        ruta: "/workflow",
        contenido: GUIA_FLUJOS,
        tarjeta: "Aprende a crear flujos automáticos para tus chats en la plataforma",
    },
    {
        modulo: "agenda",
        ruta: "/schedule",
        contenido: GUIA_AGENDA,
        tarjeta: "Aprende a gestionar tus citas y tu agenda en la plataforma",
    },
    {
        modulo: "recordatorios",
        ruta: "/reminders",
        contenido: GUIA_RECORDATORIOS,
        tarjeta: "Aprende a programar recordatorios por WhatsApp en la plataforma",
    },
    {
        modulo: "campanas",
        ruta: "/campaigns",
        contenido: GUIA_CAMPANAS,
        tarjeta: "Aprende a enviar campañas por WhatsApp a tus contactos en la plataforma",
    },
    {
        modulo: "etiquetas",
        ruta: "/tags",
        contenido: GUIA_ETIQUETAS,
        tarjeta: "Aprende a organizar tus contactos con etiquetas en la plataforma",
    },
    {
        modulo: "conexion",
        ruta: "/profile",
        contenido: GUIA_CONEXION,
        tarjeta: "Aprende a conectar tus canales y ajustar tu cuenta en la plataforma",
    },
    {
        modulo: "chats",
        ruta: "/chats",
        contenido: GUIA_CHATS,
        tarjeta: "Aprende a atender todas tus conversaciones de WhatsApp en la plataforma",
    },
    {
        modulo: "multiagenda",
        ruta: "/bookings",
        contenido: GUIA_MULTIAGENDA,
        tarjeta: "Aprende a gestionar las citas de tu equipo en la plataforma",
    },
    {
        modulo: "embudos",
        ruta: "/embudos",
        contenido: GUIA_EMBUDOS,
        tarjeta: "Aprende a organizar tus conversaciones por etapas en la plataforma",
    },
    {
        modulo: "tareas",
        ruta: "/tareas",
        contenido: GUIA_TAREAS,
        tarjeta: "Aprende a organizar y completar tus tareas en la plataforma",
    },
    {
        modulo: "correo",
        ruta: "/correo",
        contenido: GUIA_CORREO,
        tarjeta: "Aprende a leer y responder los correos de tu negocio en la plataforma",
    },
    {
        modulo: "follow-ups",
        ruta: "/crm/rules",
        contenido: GUIA_FOLLOW_UPS,
        tarjeta: "Aprende a hacer seguimiento automático a tus leads en la plataforma",
    },
    {
        modulo: "calificacion",
        ruta: "/crm/kanban",
        contenido: GUIA_CALIFICACION,
        tarjeta: "Aprende a calificar tus contactos por etapa en la plataforma",
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

