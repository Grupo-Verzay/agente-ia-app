"use client";

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useVentanaArrastrable } from "@/hooks/useVentanaArrastrable";
import { SalaDeVideo } from "@/components/video/SalaDeVideo";

/**
 * Una reunión abierta **dentro** de la plataforma.
 *
 * Quien tiene sesión no se va a ninguna parte: la reunión se abre en un panel
 * flotante encima de lo que estuviera haciendo, igual que la tarjeta de
 * llamada, y se pliega a una pastilla arrastrable con su nombre, el rato que
 * lleva y el botón de salir.
 *
 * # Por qué no una pestaña nueva
 *
 * Antes se hacía con `window.open`. Eso saca a la persona de la plataforma en
 * mitad de una conversación: para volver a lo que estaba hay que cambiar de
 * pestaña, y el chat desde el que se abrió la reunión —que es donde se habla
 * de lo que se está reuniendo— queda al otro lado. Dentro, se pliega y se
 * sigue trabajando con la reunión sonando.
 *
 * **La pestaña aparte se queda para quien entra por el enlace sin cuenta**: esa
 * persona no tiene plataforma detrás, así que la reunión ES su pestaña.
 *
 * # Cuelga del layout, como el oyente de llamadas
 *
 * Y por el mismo motivo: una reunión abierta tiene que seguir abierta al
 * cambiar de pantalla. Montado dentro del chat de equipo, navegar a Clientes
 * desmontaría el panel y con él la reunión entera.
 *
 * **No pinta nada mientras no hay ninguna abierta**, así que estar aquí no
 * cuesta: ni reloj, ni consultas, ni permisos pedidos.
 */
export function ReunionEnLaPlataforma() {
    const [codigo, setCodigo] = useState<string | null>(null);
    const [minimizada, setMinimizada] = useState(false);

    const { cajaRef, estilo, asa, posicion } = useVentanaArrastrable({
        activa: true,
        // Plegar y desplegar cambia el tamaño de arriba abajo: lo que estaba
        // dentro de la pantalla puede dejar de estarlo, y fuera está el botón
        // de salir.
        tamano: minimizada,
    });

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
            setMinimizada(false);
        };
        window.addEventListener("reunion:abrir", alAbrir);
        return () => window.removeEventListener("reunion:abrir", alAbrir);
    }, []);

    const cerrar = useCallback(() => {
        setCodigo(null);
        setMinimizada(false);
    }, []);

    if (!codigo) return null;

    return (
        // La caja de fuera sostiene la POSICIÓN y dentro cambia lo que se
        // pinta. Partirla en dos —una plegada y otra desplegada— desmontaría
        // los `<video>` al plegar, y con ellos el audio de los demás: la
        // reunión seguiría abierta y muda. Es lo mismo que ya costó entender
        // en la tarjeta de llamada.
        <div
            ref={cajaRef}
            style={estilo}
            // `key` por código: al cambiar de reunión se quiere una sala nueva
            // de cero, no la de antes con otro código encima — sus conexiones
            // son con otra gente.
            key={codigo}
            className={cn(
                "fixed z-[99] overflow-hidden rounded-xl border border-border bg-background shadow-2xl",
                minimizada
                    ? // `w-fit` y no `w-auto`: sin posición propia la caja va
                      // con `inset-x-0`, y un ancho automático entre `left:0` y
                      // `right:0` **se estira** de lado a lado de la pantalla.
                      cn("w-fit", posicion ? "" : "inset-x-0 bottom-4 mx-auto")
                    : cn(
                          // Grande, pero no a pantalla completa: esto flota
                          // encima del trabajo de alguien y tiene que verse que
                          // hay algo detrás.
                          "h-[min(85vh,44rem)] w-[min(94vw,56rem)]",
                          posicion ? "" : "inset-x-0 top-6 mx-auto",
                      ),
            )}
        >
            <SalaDeVideo
                codigo={codigo}
                minimizada={minimizada}
                onMinimizar={setMinimizada}
                asa={asa}
                alSalir={cerrar}
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
