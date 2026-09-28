/**
 * En qué formato se exporta una conversación de Chats. **Puro**, y es la
 * única lista: la pintan los TRES sitios que exportan —el menú «Acciones» de
 * la cabecera, la barra de acciones en lote y CRM › Calidad— y la valida la
 * acción del servidor. Con la lista escrita en cada pantalla, el día que se
 * añada un formato saldría en una y en las otras no, y eso no se ve como un
 * error: se ve como tres pantallas que exportan cosas distintas.
 *
 * El PDF va PRIMERO porque es el que se lee: burbujas como en WhatsApp, con el
 * logo y el nombre del negocio. El texto plano se queda tal cual estaba —es el
 * que abre cualquier programa y el que se pega en otro sitio—.
 */
export type FormatoDeExportacion = "pdf" | "txt";

export const FORMATOS_DE_EXPORTACION: ReadonlyArray<{
    clave: FormatoDeExportacion;
    rotulo: string;
    detalle: string;
}> = [
    { clave: "pdf", rotulo: "Como PDF", detalle: "Burbujas de chat, con el logo del negocio" },
    { clave: "txt", rotulo: "Como texto plano", detalle: "Un .txt que abre cualquier programa" },
];

/**
 * Lo que llega del navegador no decide nada: lo que no se entiende es texto,
 * que es lo que se exportaba siempre. Así un cliente viejo —una pestaña
 * abierta de antes del despliegue— sigue bajando lo mismo que bajaba.
 */
export function comoFormatoDeExportacion(raw: unknown): FormatoDeExportacion {
    return raw === "pdf" ? "pdf" : "txt";
}
