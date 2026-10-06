/**
 * La traducción de la herramienta VIEJA de la persona de Tavus.
 *
 * La persona de Verzy en Tavus tiene ediciones de su editor, y Tavus no deja
 * reescribirle las herramientas (PATCH → 409 `maker_changes`) ni copiarla
 * (devuelve la clave de la voz enmascarada). Así que Verzy sigue llamando a
 * `mostrar_pantalla` con su lista FIJA de páginas (`pagina`, y `modulo` para
 * una guía), no con una ruta. Sin esta traducción la sala ignoraba TODAS sus
 * llamadas: Verzy decía que mostraba algo y no salía nada.
 *
 * No es una tabla de navegación nuestra: es el diccionario de un vocabulario
 * que vive en Tavus y que el código no puede cambiar. A dónde ir lo sigue
 * decidiendo el modelo; esto solo dice qué ruta significa cada palabra suya.
 * El día que la persona acepte la herramienta nueva (`ruta`), esto sobra.
 */

/** Las palabras del enum de la persona y la ruta que significan. */
export const RUTA_DE_LA_PAGINA_DE_TAVUS: Readonly<Record<string, `/${string}`>> = {
    inicio: "/inicio",
    funciones: "/inicio#features",
    demo: "/demo",
    como_funciona: "/inicio#how",
    precios: "/inicio#pricing",
    preguntas: "/inicio#faq",
    tutoriales: "/inicio#tutoriales",
    crm: "/chats",
    crm_conversacion: "/chats",
    crm_embudo: "/embudos",
    crm_recordatorios: "/reminders",
    resultados: "/crm/reportes",
};

/** La guía de un módulo; sin un módulo que sea un nombre de guía, la portada de tutoriales. */
export function laRutaDeLaGuiaDeTavus(modulo: unknown): `/${string}` {
    const m = typeof modulo === "string" ? modulo.trim().toLowerCase() : "";
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m) ? `/guia/${m}` : "/inicio#tutoriales";
}

/** La ruta de una `pagina` de Tavus, o null si no es una de las suyas. */
export function laRutaDeLaPaginaDeTavus(pagina: unknown, modulo?: unknown): `/${string}` | null {
    const p = typeof pagina === "string" ? pagina.trim().toLowerCase() : "";
    if (!p) return null;
    if (p === "guia") return laRutaDeLaGuiaDeTavus(modulo);
    return Object.prototype.hasOwnProperty.call(RUTA_DE_LA_PAGINA_DE_TAVUS, p) ? RUTA_DE_LA_PAGINA_DE_TAVUS[p] : null;
}
