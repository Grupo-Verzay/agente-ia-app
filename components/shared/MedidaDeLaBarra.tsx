"use client";

import { useEffect } from "react";

/**
 * Mide la barra de arriba y la publica como `--alto-de-la-barra`.
 *
 * # Por qué se mide en vez de escribirla
 *
 * Porque **no está escrita en ningún sitio**. La barra va con `h-18`, que no
 * existe en la escala de Tailwind —salta de 16 a 20—, así que esa clase no
 * hace nada y la altura la pone el contenido: los botones, el breadcrumb y lo
 * que quepa en la fila. Poner un número aquí sería copiar a ojo algo que
 * cambia con el zoom, con el tamaño de letra del navegador y el día que se
 * añada un botón a la barra.
 *
 * Y de eso dependen los paneles: arrancan justo debajo de ella. Con un número
 * de más, se ve una franja vacía; con uno de menos, **el panel tapa el
 * buscador y la campanita**, que es lo que no puede pasar.
 *
 * # Y se vuelve a medir sola
 *
 * `ResizeObserver` sobre el propio elemento: cambia el alto —porque la fila se
 * parte en dos al estrechar la ventana, porque aparece un botón— y la variable
 * cambia con él. Sin observador habría que acordarse de re-medir en cada sitio
 * que pueda cambiarla, que es garantizar que el siguiente se olvide.
 *
 * Se escribe en `document.documentElement` y no en un contenedor: los paneles
 * son `fixed`, o sea que no cuelgan de la barra en el árbol, y la variable
 * tiene que llegarles esté donde esté cada uno.
 */
export function MedidaDeLaBarra({ de }: { de: React.RefObject<HTMLElement> }) {
    useEffect(() => {
        const nodo = de.current;
        if (!nodo || typeof ResizeObserver === "undefined") return;

        const anotar = () => {
            const alto = Math.round(nodo.getBoundingClientRect().height);
            document.documentElement.style.setProperty("--alto-de-la-barra", `${alto}px`);
        };

        anotar();
        const ojo = new ResizeObserver(anotar);
        ojo.observe(nodo);
        return () => ojo.disconnect();
    }, [de]);

    return null;
}
