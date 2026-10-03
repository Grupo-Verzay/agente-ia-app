/**
 * Los DATOS DE EJEMPLO de la guía de Calificación, en un solo sitio: los lee la
 * semilla (`sembrar-guia-calificacion.mjs`) para escribirlos y la IA fingida
 * (`fingido-guia-calificacion.mjs`) para saber qué puntaje devolver a cada
 * contacto. Con la tabla copiada en los dos, el día que se cambie un resumen la
 * IA fingida dejaría de reconocerlo y contestaría otro número.
 *
 * Todo es inventado: nombres de ejemplo y números de mentira (la guía es
 * pública).
 */

/** Las etiquetas que llevan las tarjetas. Colores de la fila rápida (`lib/colores-rapidos.ts`). */
export const ETIQUETAS = [
    { name: "NUEVO", color: "#3B82F6" },
    { name: "INTERESADO", color: "#22C55E" },
    { name: "COTIZADO", color: "#F97316" },
    { name: "CLIENTE", color: "#A855F7" },
];

/**
 * Los contactos, repartidos por las seis columnas. `puntaje` es el que ya traen
 * calificado; `ia` es el que devolverá la IA fingida al calificarlo (solo los
 * que tienen `resumen` y no traen puntaje). `seguimientos` son los pendientes
 * que enseña la campana; `razon`, por qué está en esa columna.
 */
export const CONTACTOS = [
    { nombre: "Paula Ríos", tel: "573005550211", etiquetas: ["INTERESADO"], resumen: "Pidió la cotización para 20 unidades y quiere recibirla hoy.", ia: { score: 89, reason: "Pidió cotización con cantidad y fecha" } },
    { nombre: "Andrés Pérez", tel: "573005550202", etiquetas: ["NUEVO"], resumen: "Preguntó por el catálogo y dijo que lo revisará con su socio la próxima semana.", ia: { score: 46, reason: "Interés inicial, todavía sin compromiso" } },
    { nombre: "Daniela Torres", tel: "573005550207", etiquetas: [], resumen: "Escribió desde un anuncio y preguntó el horario de atención.", ia: { score: 32, reason: "Exploración superficial del servicio" } },
    { nombre: "Mateo Gómez", tel: "573005550204", etiquetas: ["NUEVO"], estado: "FRIO", puntaje: 18, motivo: "Solo saludó, no volvió a escribir", razon: "No respondió los dos últimos mensajes" },
    { nombre: "Nicolás Moreno", tel: "573005550212", etiquetas: ["NUEVO"], estado: "FRIO", puntaje: 41, motivo: "Preguntó precios, sin fecha de compra", seguimientos: 1 },
    { nombre: "Sofía Herrera", tel: "573005550205", etiquetas: ["INTERESADO"], estado: "TIBIO", resumen: "Comparó dos planes y preguntó si hay descuento por pago anual.", ia: { score: 71, reason: "Consultas concretas sobre planes y pago" } },
    { nombre: "Laura Méndez", tel: "573005550209", etiquetas: ["COTIZADO"], estado: "TIBIO", puntaje: 78, motivo: "Recibió la cotización y pidió una llamada", razon: "Espera una llamada para cerrar", seguimientos: 1 },
    { nombre: "Santiago Díaz", tel: "573005550208", etiquetas: ["CLIENTE"], estado: "TIBIO", puntaje: 61, motivo: "Cliente con una duda de configuración" },
    { nombre: "Camila Rojas", tel: "573005550201", etiquetas: ["INTERESADO"], estado: "CALIENTE", puntaje: 82, motivo: "Pidió precios y fechas de entrega", razon: "Quiere el pedido antes del viernes", seguimientos: 2 },
    { nombre: "Valentina Ruiz", tel: "573005550203", etiquetas: ["COTIZADO"], estado: "CALIENTE", puntaje: 93, motivo: "Aceptó la cotización y pidió el enlace de pago" },
    { nombre: "Carolina Silva", tel: "573005550213", etiquetas: ["INTERESADO"], estado: "CALIENTE", puntaje: 88, motivo: "Preguntó formas de pago y envío" },
    { nombre: "Julián Castro", tel: "573005550206", etiquetas: ["CLIENTE"], estado: "FINALIZADO", puntaje: 96, motivo: "Compró y recomendó a un amigo", razon: "Pagó el pedido completo" },
    { nombre: "Felipe Vargas", tel: "573005550210", etiquetas: [], estado: "DESCARTADO", puntaje: 12, motivo: "Dijo que no le interesa por ahora", razon: "Compró con otro proveedor" },
];

/** La automatización de ejemplo de la columna Caliente, con sus acciones en orden. */
export const AUTOMATIZACION_DE_EJEMPLO = {
    etapa: "CALIENTE",
    nombre: "Aviso de contacto caliente",
    acciones: [
        { tipo: "TAG_ADD", etiqueta: "COTIZADO", espera: 0 },
        { tipo: "MESSAGE", config: { text: "¡Hola! Te comparto la información de pago para que reserves tu pedido." }, espera: 5 },
        { tipo: "NOTIFY_ADVISOR", config: {}, espera: 0 },
    ],
};

/** Qué puntaje devuelve la IA fingida para un texto: el del contacto cuyo resumen aparece en él. */
export function elPuntajeDeLaIa(texto) {
    const c = CONTACTOS.find((x) => x.resumen && String(texto).includes(x.resumen));
    return c?.ia ?? { score: 50, reason: "Interés moderado" };
}
