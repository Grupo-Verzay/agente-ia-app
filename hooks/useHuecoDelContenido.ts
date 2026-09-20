"use client";

import { useEffect, useState } from "react";

export type Hueco = { top: number; left: number; ancho: number; alto: number };

/**
 * Dónde está el hueco de contenido: debajo de la barra y a la derecha del menú.
 *
 * Es lo que necesita el estado **maximizado** de una reunión, que es el que se
 * pidió: llenar la pantalla **dejando ver el menú lateral y la barra de
 * arriba**, para poder cambiar de pantalla o mirar la campanita sin salir de la
 * reunión ni encogerla.
 *
 * # Por qué se MIDE y no se calcula
 *
 * La tentación es componerlo con lo que ya hay: `--alto-de-la-barra` por
 * arriba y `--sidebar-width` por la izquierda. No vale, y falla justo en los
 * casos que importan:
 *
 * - El menú tiene **tres anchos**, no uno: abierto (16rem), plegado a iconos
 *   (3rem) y **fuera de pantalla** en un móvil, donde no ocupa nada. Con la
 *   variable pelada, en un teléfono la reunión saldría con 16rem de hueco
 *   vacío a la izquierda.
 * - Y el menú **se anima** al plegarse (200 ms). Un cálculo a partir de la
 *   variable salta de golpe al valor final mientras el menú todavía se está
 *   moviendo.
 *
 * Midiendo el `<main>` —que es el hueco de verdad, el que la maquetación ya
 * calcula— las tres cosas salen solas, incluida la animación: el
 * `ResizeObserver` dispara en cada paso.
 *
 * # Hay DOS `<main>`, y `querySelector` devuelve el que NO sirve
 *
 * Esto lo cazó medir con dos navegadores de verdad, y leyendo el código no se
 * ve. El armazón del menú (`SidebarInset`) pinta un `<main>` que empieza
 * **arriba del todo** y lleva la barra superior dentro; el layout del contenido
 * pinta otro **dentro** de aquel, ya debajo de la barra. Medido a 1440x900 con
 * el menú plegado:
 *
 * | | top | left | alto |
 * | --- | --- | --- | --- |
 * | el de fuera (`SidebarInset`) | **0** | 48 | 900 |
 * | el de dentro (el contenido) | **53** | 48 | 847 |
 *
 * `document.querySelector("main")` devuelve el primero en el documento, o sea
 * el de fuera: la reunión maximizada salía **tapando la barra de arriba**, que
 * es justo lo contrario de lo que este estado existe para hacer. Y no se ve
 * como un fallo de medida: se ve como que «maximizada es lo mismo que pantalla
 * completa».
 *
 * Así que se coge **el de más adentro** —el último que no tiene otro `<main>`
 * dentro—, que es el hueco de contenido por definición. Da igual cuántas capas
 * de armazón se añadan por encima.
 *
 * # Y por qué `<main>` y no un `ref`
 *
 * Porque quien necesita la medida es un panel `fixed` que cuelga del layout, no
 * un hijo del contenido. Pasarle un `ref` obligaría a atravesar el layout
 * entero con una prop para que dos componentes que no se conocen se
 * entendieran — que es exactamente lo que este repositorio evita con
 * `--alto-de-la-barra`.
 *
 * **Sin `<main>` no se rompe nada**: se devuelve la ventana entera menos la
 * barra, que es lo que ve quien entra por el enlace público (esa página no
 * tiene ni menú ni barra). Equivocarse hacia «un poco más grande» tapa el menú
 * un rato; equivocarse hacia `null` dejaría la reunión sin pintar.
 */
export function useHuecoDelContenido(activo: boolean): Hueco | null {
    const [hueco, setHueco] = useState<Hueco | null>(null);

    useEffect(() => {
        if (!activo || typeof window === "undefined") {
            setHueco(null);
            return;
        }

        const medir = () => {
            const main = elHuecoDeVerdad();
            if (main) {
                const r = main.getBoundingClientRect();
                // Un `<main>` de 0×0 es uno que todavía no se ha maquetado, o
                // uno escondido. Medirlo dejaría la reunión en una caja
                // invisible — el mismo fallo que `queHacerConLaVentana` evita
                // en la ventana flotante, por otra puerta.
                if (r.width > 0 && r.height > 0) {
                    setHueco({
                        top: Math.round(r.top),
                        left: Math.round(r.left),
                        ancho: Math.round(r.width),
                        alto: Math.round(r.height),
                    });
                    return;
                }
            }
            // El respaldo: la ventana menos la barra de arriba, si la hay.
            const barra = Number.parseInt(
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--alto-de-la-barra",
                ) || "0",
                10,
            );
            const arriba = Number.isFinite(barra) ? barra : 0;
            setHueco({
                top: arriba,
                left: 0,
                ancho: window.innerWidth,
                alto: Math.max(0, window.innerHeight - arriba),
            });
        };

        medir();

        const ojo =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
        const main = elHuecoDeVerdad();
        if (ojo && main) ojo.observe(main);
        // El `resize` de la ventana hace falta ADEMÁS del observador: el
        // respaldo —cuando no hay `<main>`— se calcula con `innerWidth`, y de
        // eso ningún `ResizeObserver` se entera.
        window.addEventListener("resize", medir);
        // Y al girar un móvil: el `resize` llega, pero a veces antes de que la
        // maquetación se haya recolocado. Una medida más, un fotograma después.
        const alGirar = () => window.requestAnimationFrame(medir);
        window.addEventListener("orientationchange", alGirar);

        return () => {
            ojo?.disconnect();
            window.removeEventListener("resize", medir);
            window.removeEventListener("orientationchange", alGirar);
        };
    }, [activo]);

    return hueco;
}

/**
 * El `<main>` de más adentro: el hueco de contenido.
 *
 * Ver la nota de arriba — hay más de uno y el primero del documento es el del
 * armazón, que lleva la barra superior dentro. «De más adentro» es una regla
 * que no depende de cuántas capas haya: el que no contiene otro `<main>`.
 */
function elHuecoDeVerdad(): HTMLElement | null {
    const todos = [...document.querySelectorAll("main")];
    if (!todos.length) return null;
    const dentro = todos.filter((m) => !m.querySelector("main"));
    return (dentro[dentro.length - 1] ?? todos[todos.length - 1]) as HTMLElement;
}
