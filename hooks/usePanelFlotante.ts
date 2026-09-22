"use client";

import { useCallback, useRef, useState } from "react";
import {
    bajoLaBarraDeArriba,
    cabecera,
    colgadoDelIcono,
    columnaAncha,
    columnaDerecha,
    comoSiempre,
    type Caja,
    type EstiloDelPanel,
    type Primitiva,
} from "@/lib/paneles-flotantes";

/**
 * Mide su contenedor al abrir y devuelve dónde nace el panel.
 *
 * # Por qué se MIDE y no se resta de variables
 *
 * Es la misma razón que `MedidaDeLaBarra`: la columna de Chats tiene **tres
 * anchos** (`--ancho-lateral`, 18/20/22/24 rem), en un móvil ocupa la pantalla
 * entera —donde esa variable no la describe—, lleva un `max-w-[700px]` encima y
 * se anima al plegarse. Y la fila de pastillas cambia de alto con los
 * contadores. Restando variables se acierta en una anchura y se falla en las
 * otras tres, y eso no se ve como un error: se ve como un panel que unas veces
 * se sale y otras no.
 *
 * # Se mide al ABRIR, y solo al abrir
 *
 * Un panel se abre y se cierra; lo que no puede es medir en cada repintado de
 * una lista de miles de filas —esta pantalla tiene una regla entera sobre eso—.
 * Así que la medida se toma en el `onOpenChange`, que es el único momento en el
 * que hace falta, y con el panel cerrado no cuesta nada. Si la ventana cambia
 * de tamaño con el panel abierto, Radix lo recoloca solo (`autoUpdate`) con la
 * misma alineación.
 *
 * # El disparador se mide por su REF, no se adivina
 *
 * La primera versión lo buscaba con `document.activeElement`, razonando que
 * Radix le da el foco al disparador. **No siempre**: un `DropdownMenu` mueve el
 * foco dentro del contenido al abrirse, y con teclado el orden no es el mismo
 * que con ratón. Un disparador adivinado mal no da ningún error: deja el panel
 * a otra altura. Se pasa el `ref` y punto.
 *
 * # Y si no encuentra su contenedor, NO inventa
 *
 * Devuelve la colocación de siempre y lo dice en la consola. Pasa de verdad y
 * no es un fallo: `SessionTagsCombobox` lo pinta también el kanban de `/tags` y
 * `AdvisorAssignBadge` otras pantallas, donde no hay ninguna columna de Chats
 * de la que colgar. Callado sería un panel colocado de otra forma sin que nadie
 * sepa por qué.
 */

/** Las marcas del DOM. Son el contrato entre quien mide y quien se deja medir. */
export const MARCA_DE_LA_COLUMNA = "data-columna-de-chats";
export const MARCA_DE_LAS_PASTILLAS = "data-pastillas-de-chats";
export const MARCA_DE_LA_CABECERA = "data-cabecera-de-chat";
/** El disparador de Macros: su borde izquierdo es el ancho de los paneles de la cabecera. */
export const MARCA_DE_MACROS = "data-macros-de-chat";
/** La barra de arriba de la plataforma, que es la misma en todas las pantallas. */
export const MARCA_DE_LA_BARRA = "data-barra-de-arriba";

export type ClaseDePanel =
    | "columnaAncha"
    | "columnaDerecha"
    | "cabecera"
    | "colgadoDelIcono"
    | "barraDeArriba";

/** Lo que se le pasa a `PopoverContent` / `DropdownMenuContent`, ya resuelto. */
export type PropsDelPanel = {
    side: "bottom" | "top";
    align: "start" | "end" | "center";
    alignOffset: number;
    sideOffset: number;
    avoidCollisions: boolean;
    collisionPadding: number;
    style: EstiloDelPanel;
};

function caja(nodo: Element): Caja {
    const r = nodo.getBoundingClientRect();
    return { left: r.left, right: r.right, bottom: r.bottom };
}

function porDefecto(clase: ClaseDePanel): PropsDelPanel {
    const g = comoSiempre(clase === "columnaAncha" || clase === "colgadoDelIcono" ? "start" : "end");
    return { ...g, style: g.estilo };
}

export function usePanelFlotante(clase: ClaseDePanel, primitiva: Primitiva) {
    // El disparador puede estar montado DOS veces —`ChatHeader` pinta Acciones,
    // Macros y la cita en la fila del móvil y en la de escritorio con el mismo
    // hook—, y un `useRef` se queda con el último que se monte, que en un móvil
    // es el ESCONDIDO: el panel se colocaba contra un botón de 0×0. Así que se
    // guardan todos y al abrir se mide el que se ve.
    const nodos = useRef(new Set<HTMLButtonElement>());
    const disparador = useCallback((nodo: HTMLButtonElement | null) => {
        if (nodo) nodos.current.add(nodo);
    }, []);
    const [props, setProps] = useState<PropsDelPanel>(() => porDefecto(clase));

    const alAbrir = useCallback(
        (abierto: boolean) => {
            if (!abierto || typeof document === "undefined") return;

            // Se sueltan los que ya no están en el documento (un callback ref
            // recibe `null` al desmontar sin decir cuál era).
            for (const n of nodos.current) if (!n.isConnected) nodos.current.delete(n);
            const todos = Array.from(nodos.current);
            const nodo = todos.find((n) => n.getBoundingClientRect().width > 0) ?? todos[0] ?? null;
            const marca =
                clase === "cabecera" || clase === "colgadoDelIcono"
                    ? MARCA_DE_LA_CABECERA
                    : clase === "barraDeArriba"
                      ? MARCA_DE_LA_BARRA
                      : MARCA_DE_LA_COLUMNA;
            const contenedor =
                nodo?.closest(`[${marca}]`) ?? document.querySelector(`[${marca}]`);

            if (!contenedor || !nodo) {
                console.warn("[chats] un panel no encontró dónde colocarse; va como siempre", {
                    clase,
                    marca,
                    hayContenedor: !!contenedor,
                    hayDisparador: !!nodo,
                });
                setProps(porDefecto(clase));
                return;
            }

            const dispCaja = caja(nodo);
            const contCaja = caja(contenedor);

            if (clase === "barraDeArriba") {
                const g = bajoLaBarraDeArriba(
                    contCaja,
                    dispCaja,
                    document.documentElement.clientWidth,
                    primitiva,
                );
                setProps({ ...g, style: g.estilo });
                return;
            }
            if (clase === "cabecera") {
                // El ancho sale de la fila de Macros y Acciones, así que hace
                // falta el borde IZQUIERDO de Macros. Sin esa marca se cae al
                // ancho de siempre —cada panel con su `w-*`—, que es lo que ya
                // hacía: se ve de menos, nunca fuera.
                //
                // Y Macros está pintado DOS veces —la fila del móvil y la de
                // escritorio—, así que `querySelector` devuelve el primero, que
                // en escritorio es el escondido (0×0 en el origen). Con él el
                // menú de Acciones cruzaba la pantalla entera. Se coge el que
                // de verdad se ve.
                const macros = Array.from(contenedor.querySelectorAll(`[${MARCA_DE_MACROS}]`)).find(
                    (n) => n.getBoundingClientRect().width > 0,
                );
                const desde = macros ? caja(macros).left : undefined;
                const g = cabecera(contCaja, dispCaja, primitiva, desde);
                setProps({ ...g, style: g.estilo });
                return;
            }
            if (clase === "colgadoDelIcono") {
                const g = colgadoDelIcono(contCaja, dispCaja, primitiva);
                setProps({ ...g, style: g.estilo });
                return;
            }
            if (clase === "columnaDerecha") {
                const g = columnaDerecha(contCaja, dispCaja, primitiva);
                setProps({ ...g, style: g.estilo });
                return;
            }

            // Ancho completo: hace falta además el borde de abajo de las
            // pastillas. Sin esa marca se cae al borde de abajo del disparador,
            // que es el hueco de siempre — se ve de menos, nunca fuera.
            const pastillas = contenedor.querySelector(`[${MARCA_DE_LAS_PASTILLAS}]`);
            const bajo = pastillas ? caja(pastillas).bottom : dispCaja.bottom;
            const g = columnaAncha(contCaja, dispCaja, bajo, primitiva);
            setProps({ ...g, style: g.estilo });
        },
        [clase, primitiva],
    );

    return { disparador, props, alAbrir };
}
