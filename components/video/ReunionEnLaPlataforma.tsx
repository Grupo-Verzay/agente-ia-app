"use client";

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
    ESTADOS_DE_LA_VENTANA,
    VENTANA_POR_DEFECTO,
    sePuedeArrastrar,
    type EstadoDeLaVentana,
} from "@/lib/ventana-de-reunion";
import { useVentanaArrastrable } from "@/hooks/useVentanaArrastrable";
import { useHuecoJuntoAlMenu } from "@/hooks/useHuecoJuntoAlMenu";
import { LaReunion } from "@/components/video/LaReunion";

/**
 * Una reunión abierta **dentro** de la plataforma, en tres tamaños.
 *
 * Quien tiene sesión no se va a ninguna parte: la reunión se abre encima de lo
 * que estuviera haciendo y se queda abierta al cambiar de pantalla. Lo que
 * cambia es **cuánto sitio ocupa**, y son tres escalones:
 *
 * | | qué ocupa |
 * | --- | --- |
 * | `pastilla` | una barra arrastrable con el rato y colgar |
 * | `maximizada` | de borde a borde y **desde arriba del todo**: tapa la barra superior y las migas, y deja a la vista solo la barra de iconos de la izquierda |
 * | `completa` | la pantalla del equipo, esa barra incluida |
 *
 * El hueco de `maximizada` se **mide** (`useHuecoJuntoAlMenu`) y no se resta de
 * variables: el menú tiene tres anchos —abierto, plegado a iconos y fuera de
 * pantalla en un móvil— y además se anima al plegarse.
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
    /**
     * El tamaño **no se recuerda entre reuniones**, y por eso esto es un
     * `useState` pelado sin efecto que lea `localStorage`.
     *
     * De los tres estados solo uno se puede restaurar: `completa` la niega el
     * navegador sin un gesto de la persona, y abrir en `pastilla` es abrir una
     * reunión que no se ve empezar. O sea que el recuerdo solo podía devolver
     * `maximizada`, que es el valor por defecto — una preferencia que no puede
     * decir nada distinto de la constante de al lado es una escritura por gesto
     * para nada.
     */
    const [ventana, setVentana] = useState<EstadoDeLaVentana>(VENTANA_POR_DEFECTO);

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

    const hueco = useHuecoJuntoAlMenu(ventana === "maximizada");

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
            // Y se abre SIEMPRE grande, venga de donde venga: una reunión que
            // empieza plegada es una reunión que no se ve empezar, y quien
            // acaba de pulsar «entrar» espera verla.
            setVentana(VENTANA_POR_DEFECTO);
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
                "fixed z-[99] overflow-hidden border-border bg-background shadow-2xl",
                ventana === "completa"
                    ? // A pantalla completa la caja no decide nada: el
                      // navegador pone a pantalla completa el nodo de dentro y
                      // es ese el que manda. `inset-0` es solo para el instante
                      // entre pulsar y que el navegador conteste.
                      "inset-0 rounded-none border-0"
                    : ventana === "maximizada"
                      ? // Pegada al borde de arriba y a los dos lados: ni
                        // esquinas redondeadas ni borde. **Ni siquiera el de la
                        // izquierda**, que es lo único que quedaba al lado: la
                        // barra de iconos ya dibuja el suyo, así que uno más
                        // pinta dos rayas claras seguidas contra el fondo
                        // oscuro de la reunión. Medido pixel a pixel: 210 y
                        // 226 pegadas una a la otra.
                        cn("rounded-none border-0", hueco ? "" : "inset-0")
                      : // `w-fit` y no `w-auto`: sin posición propia la caja va
                        // con `inset-x-0`, y un ancho automático entre `left:0`
                        // y `right:0` **se estira** de lado a lado.
                        cn(
                            "w-fit rounded-xl border",
                            posicion ? "" : "inset-x-0 bottom-4 mx-auto",
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
                onVentana={setVentana}
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
