"use client";

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
    ESTADOS_DE_LA_VENTANA,
    LLAVE_DE_LA_VENTANA,
    VENTANA_POR_DEFECTO,
    elEstadoDeEntrada,
    loQueSeRecuerda,
    sePuedeArrastrar,
    type EstadoDeLaVentana,
} from "@/lib/ventana-de-reunion";
import { useVentanaArrastrable } from "@/hooks/useVentanaArrastrable";
import { useHuecoDelContenido } from "@/hooks/useHuecoDelContenido";
import { LaReunion } from "@/components/video/LaReunion";

/**
 * Una reunión abierta **dentro** de la plataforma, en cuatro tamaños.
 *
 * Quien tiene sesión no se va a ninguna parte: la reunión se abre encima de lo
 * que estuviera haciendo y se queda abierta al cambiar de pantalla. Lo que
 * cambia es **cuánto sitio ocupa**, y son cuatro escalones:
 *
 * | | qué ocupa |
 * | --- | --- |
 * | `pastilla` | una barra arrastrable con el rato y colgar |
 * | `panel` | una ventana flotante, arrastrable, encima del trabajo |
 * | `maximizada` | el hueco de contenido entero, **con el menú y la barra a la vista** |
 * | `completa` | la pantalla, sin navegador alrededor |
 *
 * **`maximizada` no es `completa`**, y esa es la diferencia que más se usa:
 * llena el sitio del contenido y deja fuera el menú lateral y la barra de
 * arriba, así que se puede mirar la campanita o cambiar de pantalla sin salir
 * de la reunión ni encogerla. Lo hace midiendo el `<main>` de verdad
 * (`useHuecoDelContenido`) y no restando variables: el menú tiene tres anchos
 * —abierto, plegado a iconos y fuera de pantalla en un móvil— y además se
 * anima al plegarse.
 *
 * # Cuelga del layout, como el oyente de llamadas
 *
 * Y por el mismo motivo: una reunión abierta tiene que seguir abierta al
 * cambiar de pantalla. Montado dentro del chat de equipo, navegar a Clientes
 * desmontaría el panel y con él la reunión entera. **No pinta nada mientras no
 * hay ninguna abierta**, así que estar aquí no cuesta: ni reloj, ni consultas,
 * ni permisos pedidos.
 */
export function ReunionEnLaPlataforma() {
    const [codigo, setCodigo] = useState<string | null>(null);
    const [ventana, setVentana] = useState<EstadoDeLaVentana>(VENTANA_POR_DEFECTO);

    /**
     * El tamaño recordado se lee en un EFECTO, no al pintar.
     *
     * `localStorage` no existe en el servidor, así que leerlo directamente
     * daría una salida en cada lado y rompería la hidratación. Y va dentro de
     * un `try` porque en una ventana privada leerlo puede lanzar — sin eso, el
     * panel entero se cae justo en los navegadores donde más se mira la
     * privacidad.
     */
    useEffect(() => {
        try {
            setVentana(elEstadoDeEntrada(window.localStorage.getItem(LLAVE_DE_LA_VENTANA)));
        } catch {
            // Se queda el de por defecto, que es lo correcto.
        }
    }, []);

    const cambiarVentana = useCallback((v: EstadoDeLaVentana) => {
        setVentana(v);
        try {
            // `completa` se guarda como `maximizada`: restaurarla al abrir
            // significaría pedir pantalla completa sin que nadie la haya
            // pulsado, y los navegadores lo niegan fuera de un gesto.
            window.localStorage.setItem(LLAVE_DE_LA_VENTANA, loQueSeRecuerda(v));
        } catch {
            // Que no se recuerde no puede impedir que se cambie ahora.
        }
    }, []);

    const flotante = sePuedeArrastrar(ventana);
    const { cajaRef, estilo, asa, posicion } = useVentanaArrastrable({
        // Maximizada y a pantalla completa NO se arrastran: ocupan un hueco
        // fijo, así que no tendrían a dónde ir — y el asa seguiría capturando
        // el puntero, o sea un trozo de la cabecera que deja de poder pulsarse
        // sin que se vea por qué.
        activa: flotante,
        // Cambiar de tamaño puede dejar fuera de la pantalla lo que estaba
        // dentro, y fuera está el botón de salir.
        tamano: ventana,
    });

    const hueco = useHuecoDelContenido(ventana === "maximizada");

    useEffect(() => {
        const alAbrir = (e: Event) => {
            const d = (e as CustomEvent<{ codigo?: string }>).detail;
            const cual = (d?.codigo ?? "").trim();
            if (!cual) return;
            // Abrir otra reunión con una ya abierta **no** apila dos paneles:
            // se cambia de sala. Dos reuniones a la vez son dos micrófonos
            // abiertos y dos audios encima del otro, y no hay forma de saber
            // cuál se está oyendo.
            setCodigo(cual);
            // Y se abre en el tamaño recordado, salvo que fuera la pastilla:
            // una reunión que empieza plegada es una reunión que no se ve
            // empezar, y quien acaba de pulsar «entrar» espera verla.
            setVentana((v) => (v === "pastilla" ? "panel" : v));
        };
        window.addEventListener("reunion:abrir", alAbrir);
        return () => window.removeEventListener("reunion:abrir", alAbrir);
    }, []);

    const cerrar = useCallback(() => {
        setCodigo(null);
    }, []);

    if (!codigo) return null;

    // Maximizada: la caja se coloca sobre el hueco medido. Mientras no haya
    // medida —el primer fotograma— se usa la ventana entera en vez de no
    // pintar: un panel que aparece medio segundo después se ve como un
    // parpadeo, y uno que no aparece se ve como que el botón no hizo nada.
    const estiloMaximizada =
        ventana === "maximizada" && hueco
            ? {
                  top: `${hueco.top}px`,
                  left: `${hueco.left}px`,
                  width: `${hueco.ancho}px`,
                  height: `${hueco.alto}px`,
              }
            : undefined;

    return (
        // La caja de fuera sostiene la POSICIÓN y dentro cambia lo que se
        // pinta. Partirla en dos —una plegada y otra desplegada— desmontaría
        // los `<video>` al plegar, y con ellos el audio de los demás: la
        // reunión seguiría abierta y muda. Es lo mismo que ya costó entender
        // en la tarjeta de llamada.
        <div
            ref={cajaRef}
            style={flotante ? estilo : estiloMaximizada}
            // `key` por código: al cambiar de reunión se quiere una sala nueva
            // de cero, no la de antes con otro código encima — sus conexiones
            // son con otra gente.
            key={codigo}
            className={cn(
                "fixed z-[99] overflow-hidden border border-border bg-background shadow-2xl",
                ventana === "completa"
                    ? // A pantalla completa la caja no decide nada: el
                      // navegador la pone a pantalla completa y lo que manda es
                      // el nodo de dentro. `inset-0` es solo para el instante
                      // entre pulsar y que el navegador conteste.
                      "inset-0 rounded-none"
                    : ventana === "maximizada"
                      ? cn("rounded-lg", hueco ? "" : "inset-0")
                      : ventana === "pastilla"
                        ? // `w-fit` y no `w-auto`: sin posición propia la caja
                          // va con `inset-x-0`, y un ancho automático entre
                          // `left:0` y `right:0` **se estira** de lado a lado.
                          cn("w-fit rounded-xl", posicion ? "" : "inset-x-0 bottom-4 mx-auto")
                        : cn(
                              // Grande, pero no a pantalla completa: esto flota
                              // encima del trabajo de alguien y tiene que verse
                              // que hay algo detrás.
                              "h-[min(85vh,44rem)] w-[min(94vw,56rem)] rounded-xl",
                              posicion ? "" : "inset-x-0 top-6 mx-auto",
                          ),
            )}
        >
            {/* `LaReunion` y NO `SalaDeVideo` a pelo, que es el fallo que
                este panel tuvo desde que se escribió: la sala da por hecho que
                ya se entró, y quien inscribe a alguien del equipo en
                `sala_participantes` es la puerta. Sin ella el panel se abría,
                la cámara se encendía y el latido contestaba —con razón— que
                esa persona no estaba en la reunión. */}
            <LaReunion
                codigo={codigo}
                ventana={ventana}
                onVentana={cambiarVentana}
                estadosQueOfrece={ESTADOS_DE_LA_VENTANA}
                asa={flotante ? asa : undefined}
                alCerrar={cerrar}
            />
        </div>
    );
}

/**
 * Abrir una reunión dentro de la plataforma.
 *
 * Se manda por un evento del navegador y **no por un contexto**, igual que la
 * llamada del directo: el panel cuelga del layout y quien lo dispara puede
 * estar en cualquier pantalla —el diálogo de abrir reunión, la tarjeta de una
 * burbuja—. Con un contexto habría que envolver media aplicación para que dos
 * botones se entendieran.
 */
export function abrirLaReunionAqui(codigo: string): void {
    window.dispatchEvent(new CustomEvent("reunion:abrir", { detail: { codigo } }));
}
