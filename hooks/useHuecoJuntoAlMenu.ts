"use client";

import { useEffect, useState } from "react";

export type Hueco = { top: number; left: number; ancho: number; alto: number };

/**
 * El hueco que deja el menú: todo lo que hay a su derecha, **de arriba abajo**.
 *
 * Es lo que necesita el estado **maximizado** de una reunión: llenar la ventana
 * tapando la barra de arriba y las migas, y dejar a la vista **solo la barra de
 * iconos de la izquierda**, que es por donde se cambia de pantalla sin salir de
 * la reunión.
 *
 * # Por qué se MIDE y no se calcula
 *
 * La tentación es componerlo con lo que ya hay: `--sidebar-width` por la
 * izquierda. No vale, y falla justo en los casos que importan:
 *
 * - El menú tiene **tres anchos**, no uno: abierto (16rem), plegado a iconos
 *   (3rem) y **fuera de pantalla** en un móvil, donde no ocupa nada. Con la
 *   variable pelada, en un teléfono la reunión saldría con 16rem de hueco
 *   vacío a la izquierda.
 * - Y el menú **se anima** al plegarse (200 ms). Un cálculo a partir de la
 *   variable salta de golpe al valor final mientras el menú todavía se está
 *   moviendo.
 *
 * Midiendo el `<main>` del armazón —que es exactamente la franja a la derecha
 * del menú, de borde a borde— las tres cosas salen solas, incluida la
 * animación: el `ResizeObserver` dispara en cada paso.
 *
 * # Hay DOS `<main>`, y aquí manda el de FUERA
 *
 * El armazón del menú (`SidebarInset`) pinta un `<main>` que empieza **arriba
 * del todo** y lleva la barra superior dentro; el layout del contenido pinta
 * otro **dentro** de aquel, ya debajo de la barra. Medido a 1440x900 con el
 * menú plegado:
 *
 * | | top | left | alto |
 * | --- | --- | --- | --- |
 * | el de fuera (`SidebarInset`) | **0** | 48 | **900** |
 * | el de dentro (el contenido) | 53 | 48 | 847 |
 *
 * **Aquí se quiere el de fuera**, y conviene decirlo con todas las letras
 * porque es **lo contrario de lo que se arregló en el #824**: entonces
 * maximizada dejaba ver la barra de arriba a propósito y el de dentro era el
 * bueno; ahora maximizada tiene que taparla, así que el bueno es el de fuera.
 * La regla no es «coge el de dentro» ni «coge el de fuera»: es **coge el que
 * empieza donde tiene que empezar la caja**, y por eso este hook dice en su
 * nombre cuál mide en vez de dejarlo a un `querySelector` suelto.
 *
 * `document.querySelector("main")` acierta hoy por casualidad —devuelve el
 * primero del documento, que es el de fuera—, pero acertar por el orden del
 * árbol es lo que ya falló una vez. Se coge **el que no está dentro de otro
 * `<main>`**, que es una regla que no depende de cuántas capas se añadan.
 *
 * # Y por qué `<main>` y no un `ref`
 *
 * Porque quien necesita la medida es un panel `fixed` que cuelga del layout, no
 * un hijo del contenido. Pasarle un `ref` obligaría a atravesar el layout
 * entero con una prop para que dos componentes que no se conocen se
 * entendieran — que es exactamente lo que este repositorio evita con
 * `--alto-de-la-barra`.
 *
 * **Sin `<main>` no se rompe nada**: se devuelve la ventana entera, que es lo
 * que ve quien entra por el enlace público (esa página no tiene ni menú ni
 * barra). Equivocarse hacia «un poco más grande» tapa el menú un rato;
 * equivocarse hacia `null` dejaría la reunión sin pintar.
 */
export function useHuecoJuntoAlMenu(activo: boolean): Hueco | null {
    const [hueco, setHueco] = useState<Hueco | null>(null);

    useEffect(() => {
        if (!activo || typeof window === "undefined") {
            setHueco(null);
            return;
        }

        const medir = () => {
            const main = elArmazonDeFuera();
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
            // El respaldo: la ventana entera. Aquí NO se descuenta la barra de
            // arriba —como sí hacía cuando esto medía el hueco de contenido—,
            // porque maximizada viene justamente a taparla.
            setHueco({ top: 0, left: 0, ancho: window.innerWidth, alto: window.innerHeight });
        };

        medir();

        const ojo =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
        const main = elArmazonDeFuera();
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
 * El `<main>` del armazón: el de más AFUERA, el que empieza en el borde de
 * arriba de la ventana.
 *
 * Ver la nota de arriba — hay más de uno, y cuál sirve depende de dónde tiene
 * que empezar la caja. «El de más afuera» es una regla que no depende de
 * cuántas capas haya: el que no está dentro de otro `<main>`.
 */
function elArmazonDeFuera(): HTMLElement | null {
    const todos = [...document.querySelectorAll("main")];
    const fuera = todos.filter((m) => !m.parentElement?.closest("main"));
    return (fuera[0] ?? todos[0] ?? null) as HTMLElement | null;
}
