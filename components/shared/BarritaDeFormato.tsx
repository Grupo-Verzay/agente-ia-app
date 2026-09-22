"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Strikethrough } from "lucide-react";
import { dondeVaLaBarrita, MARCAS_DE_LA_BARRITA, type Rect } from "@/lib/barrita-de-formato";
import { cn } from "@/lib/utils";

/**
 * La barrita de formato que sale al SELECCIONAR texto en el cuadro de escribir.
 *
 * # Qué sustituye
 *
 * Al botón de la «T», que abría un menú con cuatro marcas. Eran dos gestos
 * —seleccionar y luego buscar el botón— y un botón más en una fila que en un
 * panel de 18 rem ya se queda sin ancho. Ahora se selecciona y las tres marcas
 * están encima de lo seleccionado, como en WhatsApp.
 *
 * **Tres y no cuatro.** El monoespaciado se cae con el menú: es la marca que
 * nadie usa en una conversación con un cliente, y la barrita tiene que caber al
 * lado de una palabra corta. Su atajo de teclado no existía tampoco.
 *
 * # Dónde está el sitio de una selección de un `<textarea>`
 *
 * En ninguna parte: un `<textarea>` no expone el rectángulo de su selección
 * —`window.getSelection()` no entra dentro de un control de formulario—. Así
 * que se mide con un **espejo**: un div escondido con la MISMA tipografía, el
 * mismo ancho y los mismos rellenos, con el texto de antes de la selección,
 * luego un `<span>` con lo seleccionado, y luego el resto. El rectángulo de ese
 * span es el de la selección.
 *
 * Tres cosas del espejo que no se ven y descuadran igual:
 *
 * 1. **`white-space` y `word-wrap` se copian**, o el espejo no parte las líneas
 *    por donde las parte el cuadro y la barrita sale una línea más arriba.
 * 2. **Se resta `scrollTop`**: el cuadro crece hasta tres renglones y a partir
 *    de ahí se desplaza por dentro. Sin restarlo, al escribir el cuarto la
 *    barrita se queda donde estaba el texto antes de desplazarse.
 * 3. **El espejo se mide y se tira en la misma vuelta.** Dejarlo montado sería
 *    un segundo árbol de texto repintándose con cada tecla.
 *
 * # Y la selección se RECUERDA
 *
 * Pulsar la barrita en un móvil quita el foco del cuadro y con él la selección,
 * así que al aplicar la marca ya no habría nada seleccionado y se escribirían
 * dos asteriscos pegados. Se guarda el último tramo no vacío y se aplica sobre
 * ÉL, no sobre lo que el cuadro diga en ese instante.
 */

/** Lo que se le pide al espejo para que mida lo mismo que el cuadro. */
const LO_QUE_SE_COPIA = [
    "boxSizing",
    "width",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "textIndent",
    "wordSpacing",
    "whiteSpace",
    "overflowWrap",
    "wordBreak",
    "tabSize",
] as const;

/**
 * El rectángulo de lo seleccionado, en coordenadas de la ventana.
 *
 * Devuelve `null` cuando no hay nada seleccionado — que es también la señal de
 * que la barrita no se pinta.
 */
export function rectanguloDeLaSeleccion(cuadro: HTMLTextAreaElement): Rect | null {
    const inicio = cuadro.selectionStart ?? 0;
    const fin = cuadro.selectionEnd ?? 0;
    if (inicio === fin) return null;

    const estilo = window.getComputedStyle(cuadro);
    const espejo = document.createElement("div");
    for (const prop of LO_QUE_SE_COPIA) {
        // `any` acotado: son propiedades de texto y el índice de `CSSStyleDeclaration`
        // no está tipado por nombre.
        (espejo.style as unknown as Record<string, string>)[prop] = (
            estilo as unknown as Record<string, string>
        )[prop];
    }
    espejo.style.position = "absolute";
    espejo.style.visibility = "hidden";
    espejo.style.top = "0";
    espejo.style.left = "-9999px";
    espejo.style.height = "auto";
    espejo.style.overflow = "hidden";
    // Un `<textarea>` no colapsa espacios ni parte palabras a lo loco; si el
    // computado no lo dice, se pone lo que hace el control de verdad.
    if (!espejo.style.whiteSpace || espejo.style.whiteSpace === "normal") {
        espejo.style.whiteSpace = "pre-wrap";
    }
    espejo.style.overflowWrap = espejo.style.overflowWrap || "break-word";

    const texto = cuadro.value;
    espejo.appendChild(document.createTextNode(texto.slice(0, inicio)));
    const marca = document.createElement("span");
    // Un salto de línea al final no ocupa ancho: se le añade un carácter que sí,
    // o el rectángulo sale de ancho cero y la barrita se centra en el margen.
    marca.textContent = texto.slice(inicio, fin) || "​";
    espejo.appendChild(marca);
    espejo.appendChild(document.createTextNode(texto.slice(fin)));

    document.body.appendChild(espejo);
    const cajas = Array.from(marca.getClientRects());
    const suya = marca.getBoundingClientRect();
    const espejoCaja = espejo.getBoundingClientRect();
    document.body.removeChild(espejo);

    const union = cajas.length
        ? {
              left: Math.min(...cajas.map((c) => c.left)),
              right: Math.max(...cajas.map((c) => c.right)),
              top: Math.min(...cajas.map((c) => c.top)),
              bottom: Math.max(...cajas.map((c) => c.bottom)),
          }
        : { left: suya.left, right: suya.right, top: suya.top, bottom: suya.bottom };

    const cuadroCaja = cuadro.getBoundingClientRect();
    const dx = cuadroCaja.left - espejoCaja.left - cuadro.scrollLeft;
    const dy = cuadroCaja.top - espejoCaja.top - cuadro.scrollTop;

    return {
        left: union.left + dx,
        right: union.right + dx,
        top: union.top + dy,
        bottom: union.bottom + dy,
    };
}

export function BarritaDeFormato({
    cuadro,
    onAplicar,
    activa = true,
}: {
    cuadro: React.RefObject<HTMLTextAreaElement>;
    /** Aplica la marca sobre el tramo que se recordó, no sobre el de ahora. */
    onAplicar: (marca: string, inicio: number, fin: number) => void;
    /** Con el cuadro apagado —grabando, sin línea— no sale. */
    activa?: boolean;
}) {
    const [sitio, setSitio] = useState<{ left: number; top: number } | null>(null);
    const tramo = useRef<{ inicio: number; fin: number } | null>(null);
    const caja = useRef<HTMLDivElement>(null);
    const seleccion = useRef<Rect | null>(null);

    const mirar = useCallback(() => {
        const nodo = cuadro.current;
        if (!activa || !nodo || document.activeElement !== nodo) {
            seleccion.current = null;
            setSitio(null);
            return;
        }
        const r = rectanguloDeLaSeleccion(nodo);
        if (!r) {
            seleccion.current = null;
            setSitio(null);
            return;
        }
        tramo.current = { inicio: nodo.selectionStart ?? 0, fin: nodo.selectionEnd ?? 0 };
        seleccion.current = r;
        // Sin medida propia todavía se coloca con un tamaño de arranque; el
        // efecto de abajo la recoloca con el de verdad en el mismo fotograma.
        const propia = caja.current?.getBoundingClientRect();
        setSitio(
            dondeVaLaBarrita(
                r,
                { ancho: propia?.width || 120, alto: propia?.height || 34 },
                { ancho: window.innerWidth, alto: window.innerHeight },
            ),
        );
    }, [activa, cuadro]);

    // Ya pintada, se recoloca con su tamaño de verdad. Sin esto la primera vez
    // sale centrada sobre un ancho supuesto y salta al segundo fotograma.
    useLayoutEffect(() => {
        if (!sitio || !seleccion.current || !caja.current) return;
        const propia = caja.current.getBoundingClientRect();
        const bueno = dondeVaLaBarrita(
            seleccion.current,
            { ancho: propia.width, alto: propia.height },
            { ancho: window.innerWidth, alto: window.innerHeight },
        );
        if (bueno.left !== sitio.left || bueno.top !== sitio.top) {
            setSitio({ left: bueno.left, top: bueno.top });
        }
    }, [sitio]);

    useEffect(() => {
        // `selectionchange` es el único que se entera de TODAS las formas de
        // seleccionar —ratón, teclado, el dedo, «seleccionar todo»—. Los otros
        // dos son para lo que cambia el SITIO sin cambiar la selección.
        const alSeleccionar = () => mirar();
        document.addEventListener("selectionchange", alSeleccionar);
        window.addEventListener("resize", alSeleccionar);
        window.addEventListener("scroll", alSeleccionar, true);
        return () => {
            document.removeEventListener("selectionchange", alSeleccionar);
            window.removeEventListener("resize", alSeleccionar);
            window.removeEventListener("scroll", alSeleccionar, true);
        };
    }, [mirar]);

    useEffect(() => {
        if (!activa) setSitio(null);
    }, [activa]);

    if (!sitio) return null;

    return (
        <div
            ref={caja}
            data-barrita-de-formato
            role="toolbar"
            aria-label="Formato del texto seleccionado"
            className={cn(
                "fixed z-[60] flex items-center gap-0.5 rounded-xl border border-border",
                "bg-popover p-1 shadow-lg",
            )}
            style={{ left: sitio.left, top: sitio.top }}
            // Sin esto, pulsar mueve el foco fuera del cuadro y se pierde lo
            // seleccionado, que es justo sobre lo que hay que aplicar la marca.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
        >
            {MARCAS_DE_LA_BARRITA.map(({ marca, nombre, atajo }) => {
                const Icono =
                    marca === "*" ? Bold : marca === "_" ? Italic : Strikethrough;
                return (
                    <button
                        key={marca}
                        type="button"
                        data-marca={marca}
                        aria-label={nombre}
                        title={`${nombre} (${atajo})`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            const t = tramo.current;
                            if (!t) return;
                            onAplicar(marca, t.inicio, t.fin);
                        }}
                    >
                        <Icono className="h-4 w-4" />
                    </button>
                );
            })}
        </div>
    );
}
