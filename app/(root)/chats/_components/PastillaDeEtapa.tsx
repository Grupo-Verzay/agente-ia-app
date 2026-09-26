"use client";

import { cn } from "@/lib/utils";
import { RELLENO_DE_PX_2 } from "@/lib/pastillas-de-la-fila";
import {
    ANCHO_DE_LA_PASTILLA,
    elTextoDeLaPastilla,
    losTonosDeLaEtapa,
    type EtapaDeLaFila,
} from "@/lib/embudos";

/**
 * La etapa del embudo de una conversación, en la fila de la bandeja.
 *
 * # Es la MISMA pastilla que la del estado
 *
 * Mismo alto (`h-6`), mismo redondeo (`rounded-full`), misma tipografía
 * (`text-xs`) y el mismo relleno compacto de la fila (`lib/pastillas-de-la-fila`).
 * Lo único suyo es el color, que sale de la etapa. **Sin punto dentro**, como
 * la de estado en esta fila (`showDot={false}`): el color ya lo lleva la
 * pastilla entera, y el punto solo le quitaría ancho al nombre.
 *
 * Escrita con sus propias medidas quedaría un par de píxeles distinta de la de
 * al lado y la fila se leería descuadrada sin que nadie supiera por qué.
 *
 * Va la PRIMERA de la fila, delante de la calificación y de «Asignar»: de
 * izquierda a derecha se lee «en qué punto del embudo está» → «cómo de
 * caliente» → «de quién es», que es el mismo orden en que se decide en el menú
 * de la cabecera. Iba entre el estado y el asesor, y así la fila y el menú
 * contaban lo mismo al revés.
 *
 * # Sin embudo no hay pastilla
 *
 * Una cuenta que no usa embudos no pinta ninguna, y una conversación cuya
 * cuenta sí los usa siempre cae en alguno (el de su asesor, o el por defecto).
 * `etapa` en `null` es exactamente eso, y entonces aquí no se pinta nada —ni un
 * hueco, porque la fila reparte con `gap` y lo que no está no deja su sitio—.
 *
 * # El nombre entero, en el globo
 *
 * El texto se recorta a `TOPE_DE_TEXTO_DE_PASTILLA` caracteres y el `title`
 * lleva el nombre completo. Es un `title` y no un tooltip de Radix a propósito:
 * esta pastilla sale en TODAS las filas y la lista tiene miles, así que montar
 * un proveedor y dos nodos más por fila es justo lo que la regla de *la lista
 * es grande, no rehacerla por gusto* evita. Los tooltips de la fila —la espera,
 * los recordatorios— salen en unas pocas.
 */
export function PastillaDeEtapa({ etapa }: { etapa?: EtapaDeLaFila | null }) {
    if (!etapa) return null;

    const tonos = losTonosDeLaEtapa(etapa.color);
    const texto = elTextoDeLaPastilla(etapa.nombre);

    return (
        <span
            data-pastilla-de-etapa
            /*
             * `data-ui="badge"` no es decoración: es el gancho con el que
             * `globals.css` baja un `.text-xs` a 12 px dentro de
             * `.app-module-content`, donde si no vale 14. La pastilla de estado
             * lo consigue por vivir dentro de un `<button>` —es el disparador
             * de su menú— y esta no es pulsable, así que sin la marca saldría
             * con la letra DOS píxeles más grande que la de al lado. Medido.
             */
            data-ui="badge"
            title={etapa.nombre}
            className={cn(
                "inline-flex h-6 shrink-0 items-center overflow-hidden rounded-full border text-xs font-medium",
                RELLENO_DE_PX_2,
                ANCHO_DE_LA_PASTILLA,
            )}
            /* Con el color libre no hay clase de Tailwind que valga —solo genera
               lo que ve literal—, así que los tres tonos salen de `style` y de
               la MISMA función que pinta el tablero y el icono de la cabecera.
               El alfa hace lo que hacían las variantes `dark:` a mano: un tono
               al 12 % se lee sobre fondo claro y sobre fondo oscuro. */
            style={{ color: tonos.pleno, backgroundColor: tonos.fondo, borderColor: tonos.borde }}
        >
            {/* El `truncate` va en el hijo y no en la pastilla: en un contenedor
                flex el texto suelto cae en una caja anónima, y ahí
                `text-overflow` no recorta con «…». */}
            <span className="truncate">{texto}</span>
        </span>
    );
}
