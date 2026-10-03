/**
 * Los nombres de la pantalla Cobros (`/cobros`), puros: los filtros de la barra,
 * las columnas de la cartera, las opciones del «⋯» de una deuda, los campos del
 * formulario y los de la configuración.
 *
 * Viven aquí y no escritos dentro del componente para que la guía pública
 * (`lib/guia-cobros.ts`) diga EXACTAMENTE lo que la pantalla enseña: un filtro o
 * una opción renombrada en un solo sitio seguiría saliendo con el nombre viejo
 * en la guía, y nadie lo notaría. Lo leen la pantalla, la guía y su banco.
 */

import type { SituacionDelCobro } from "@/lib/cobros";

/** Los filtros de la barra, en su orden. «Sin fecha» no tiene filtro: sale en «Todos». */
export const FILTROS_DE_LA_CARTERA: ReadonlyArray<{ clave: SituacionDelCobro | "todos"; etiqueta: string }> = [
    { clave: "todos", etiqueta: "Todos" },
    { clave: "comprobante", etiqueta: "Comprobantes" },
    { clave: "vencida", etiqueta: "Vencidas" },
    { clave: "porVencer", etiqueta: "Por vencer" },
    { clave: "alDia", etiqueta: "Al día" },
];

/** Las columnas de la cartera, en su orden, con el `data-zona` de su celda. */
export const COLUMNAS_DE_LA_CARTERA = [
    { nombre: "Cliente", zona: "cliente" },
    { nombre: "Concepto", zona: "concepto" },
    { nombre: "Monto", zona: "monto" },
    { nombre: "Vence", zona: "vence" },
    { nombre: "Estado", zona: "estado" },
    { nombre: "Ciclo", zona: "ciclo" },
] as const;

/**
 * Las opciones del «⋯» de una deuda, en su orden. La segunda cambia con el
 * estado: «Llegó el comprobante» en una pendiente y «No era: volver a
 * pendiente» en una con comprobante. «Eliminar» solo sale a quien administra.
 */
export const OPCIONES_DE_UNA_DEUDA = {
    cobrar: "Cobrar ahora",
    comprobante: "Llegó el comprobante",
    volver: "No era: volver a pendiente",
    confirmar: "Confirmar pago",
    historial: "Historial de ciclos",
    editar: "Editar",
    eliminar: "Eliminar",
} as const;

/** Los campos del formulario «Nuevo cobro», en su orden (`data-campo`). */
export const CAMPOS_DEL_COBRO = [
    { nombre: "Cliente", campo: "cliente" },
    { nombre: "WhatsApp", campo: "whatsapp" },
    { nombre: "¿Qué le cobras?", campo: "concepto" },
    { nombre: "Monto", campo: "monto" },
    { nombre: "Moneda", campo: "moneda" },
    { nombre: "Vence", campo: "vence" },
    { nombre: "Días de licencia", campo: "licencia" },
    { nombre: "Días de gracia", campo: "gracia" },
    { nombre: "Cuenta de cobro", campo: "adjuntos" },
    { nombre: "Datos de pago de este cobro (opcional)", campo: "nota" },
] as const;

/** Los títulos de los tres mensajes, uno por aviso, en su orden. */
export const TITULO_DEL_AVISO = {
    antes: "Días antes de vencer",
    elDia: "El día del vencimiento",
    despues: "Días después de vencido",
} as const;

/** Los campos de «Configuración de cobros», en su orden (`data-campo`). */
export const CAMPOS_DE_LA_CONFIGURACION = [
    { nombre: "Cómo te pagan", campo: "pago" },
    { nombre: "Días antes", campo: "antes" },
    { nombre: "El día que vence", campo: "elDia" },
    { nombre: "Días después", campo: "despues" },
    { nombre: "Los mensajes", campo: "mensajes" },
] as const;
