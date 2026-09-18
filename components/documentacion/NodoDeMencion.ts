import { Node, mergeAttributes } from "@tiptap/react";

import { NODO_DE_MENCION, type TipoDeMencion } from "@/lib/documentacion";

/**
 * La mención dentro del texto: un cliente, una tarea, un ticket, otro documento.
 *
 * ## Por qué un nodo propio y no `@tiptap/extension-mention`
 *
 * **Cero dependencias nuevas.** `@tiptap/react` ya reexporta `Node` y
 * `mergeAttributes`, así que la extensión oficial habría añadido dos paquetes
 * —ella y `@tiptap/suggestion`— para traerse un selector imperativo que
 * además habría que envolver. El selector se escribe aquí en React, con las
 * cinco reglas que ya costaron una vuelta en el chat de equipo (`onMouseDown`
 * y no `onClick`, el cursor después del pintado, y las demás).
 *
 * ## Es un ÁTOMO
 *
 * `atom: true` hace que la pastilla se seleccione y se borre entera. Sin eso se
 * puede meter el cursor dentro y borrar media etiqueta, y entonces el nodo
 * sigue ahí con un texto a medias: la mención seguiría contando para el
 * retroenlace mientras en pantalla pone otra cosa.
 *
 * ## Y los atributos van como `data-`
 *
 * TipTap, por defecto, escribiría `tipo="cliente"` — un atributo que no existe
 * en HTML. Con `data-` el HTML es válido y, sobre todo, la pantalla puede leer
 * a dónde lleva la pastilla con un solo `closest('[data-mencion]')` en vez de
 * colgarle un manejador a cada una.
 */

export type AtributosDeMencion = {
    tipo: TipoDeMencion | null;
    refId: string | null;
    etiqueta: string | null;
};

/** Lo que se pinta delante de la etiqueta, para distinguirlas de un vistazo. */
export const SENAL_DEL_TIPO: Record<TipoDeMencion, string> = {
    cliente: "◆",
    tarea: "✓",
    ticket: "◇",
    documento: "▸",
};

export const NodoDeMencion = Node.create({
    name: NODO_DE_MENCION,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return {
            tipo: {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute("data-tipo"),
                renderHTML: (attrs: AtributosDeMencion) =>
                    attrs.tipo ? { "data-tipo": attrs.tipo } : {},
            },
            refId: {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute("data-ref-id"),
                renderHTML: (attrs: AtributosDeMencion) =>
                    attrs.refId ? { "data-ref-id": attrs.refId } : {},
            },
            etiqueta: {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute("data-etiqueta"),
                renderHTML: (attrs: AtributosDeMencion) =>
                    attrs.etiqueta ? { "data-etiqueta": attrs.etiqueta } : {},
            },
        };
    },

    parseHTML() {
        return [{ tag: "span[data-mencion]" }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const tipo = node.attrs.tipo as TipoDeMencion | null;
        const etiqueta = (node.attrs.etiqueta as string | null) ?? "";
        return [
            "span",
            mergeAttributes(HTMLAttributes, {
                "data-mencion": "",
                class:
                    "mencion inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.9em] " +
                    "bg-primary/10 text-primary cursor-pointer align-baseline",
            }),
            `${tipo ? SENAL_DEL_TIPO[tipo] : ""} ${etiqueta}`.trim(),
        ];
    },

    /**
     * Lo que sale al pedirle el texto plano al editor.
     *
     * No lo usa el servidor —ahí manda `leerElContenido`, que es puro y está
     * probado— pero sí lo usan el copiar y el arrastrar del navegador: sin
     * esto, copiar un párrafo con una mención pega un hueco.
     */
    renderText({ node }) {
        return (node.attrs.etiqueta as string | null) ?? "";
    },
});
