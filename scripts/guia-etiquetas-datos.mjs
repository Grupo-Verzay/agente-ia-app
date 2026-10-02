/**
 * Los DATOS DE EJEMPLO de la guía de Etiquetas, en un solo sitio: los lee la
 * semilla (`sembrar-guia-etiquetas.mjs`) para escribirlos y la IA fingida
 * (`fingido-guia-etiquetas.mjs`) para saber qué puntaje devolver a cada
 * contacto. Con la tabla copiada en los dos, el día que se cambie un resumen la
 * IA fingida dejaría de reconocerlo y contestaría otro número.
 *
 * Todo es inventado: nombres de ejemplo y números de mentira (la guía es
 * pública).
 */

/** Las etiquetas, en su orden. Los colores son los de la fila rápida (`lib/colores-rapidos.ts`). */
export const ETIQUETAS = [
    { name: "NUEVO", color: "#3B82F6" },
    { name: "INTERESADO", color: "#22C55E" },
    { name: "COTIZADO", color: "#F97316" },
    { name: "CLIENTE", color: "#A855F7" },
    { name: "SOPORTE", color: "#EC4899" },
];

/**
 * Los contactos. `puntaje` es el que ya traen calificado; `ia` es el que
 * devolverá la IA fingida al calificarlo (solo los que tienen `resumen`).
 */
export const CONTACTOS = [
    { nombre: "Camila Rojas", tel: "573005550101", etiquetas: ["INTERESADO"], puntaje: 82, motivo: "Pidió precios y fechas de entrega", estado: "CALIENTE" },
    { nombre: "Andrés Pérez", tel: "573005550102", etiquetas: ["NUEVO"], resumen: "Preguntó por el catálogo y dijo que lo revisará con su socio la próxima semana.", ia: { score: 46, reason: "Interés inicial, todavía sin compromiso" } },
    { nombre: "Valentina Ruiz", tel: "573005550103", etiquetas: ["COTIZADO"], puntaje: 93, motivo: "Aceptó la cotización y pidió el enlace de pago", estado: "CALIENTE" },
    { nombre: "Mateo Gómez", tel: "573005550104", etiquetas: ["NUEVO"], puntaje: 18, motivo: "Solo saludó, no volvió a escribir", estado: "FRIO" },
    { nombre: "Sofía Herrera", tel: "573005550105", etiquetas: ["INTERESADO"], resumen: "Comparó dos planes y preguntó si hay descuento por pago anual.", ia: { score: 71, reason: "Consultas concretas sobre planes y pago" } },
    { nombre: "Julián Castro", tel: "573005550106", etiquetas: ["CLIENTE"], puntaje: 96, motivo: "Compró y recomendó a un amigo", estado: "FINALIZADO" },
    { nombre: "Daniela Torres", tel: "573005550107", etiquetas: [], resumen: "Escribió desde un anuncio y preguntó el horario de atención.", ia: { score: 32, reason: "Exploración superficial del servicio" } },
    { nombre: "Santiago Díaz", tel: "573005550108", etiquetas: ["CLIENTE", "SOPORTE"], puntaje: 61, motivo: "Cliente con una duda de configuración", estado: "TIBIO" },
    { nombre: "Laura Méndez", tel: "573005550109", etiquetas: ["COTIZADO"], puntaje: 78, motivo: "Recibió la cotización y pidió una llamada", estado: "TIBIO" },
    { nombre: "Felipe Vargas", tel: "573005550110", etiquetas: [], puntaje: 12, motivo: "Dijo que no le interesa por ahora", estado: "DESCARTADO" },
    { nombre: "Paula Ríos", tel: "573005550111", etiquetas: ["INTERESADO"], resumen: "Pidió la cotización para 20 unidades y quiere recibirla hoy.", ia: { score: 89, reason: "Pidió cotización con cantidad y fecha" } },
    { nombre: "Nicolás Moreno", tel: "573005550112", etiquetas: ["NUEVO"], puntaje: 41, motivo: "Preguntó precios, sin fecha de compra", estado: "TIBIO" },
];

/** Qué puntaje devuelve la IA fingida para un texto: el del contacto cuyo resumen aparece en él. */
export function elPuntajeDeLaIa(texto) {
    const c = CONTACTOS.find((x) => x.resumen && String(texto).includes(x.resumen));
    return c?.ia ?? { score: 50, reason: "Interés moderado" };
}
