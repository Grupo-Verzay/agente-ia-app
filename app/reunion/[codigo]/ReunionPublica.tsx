"use client";

import { useState } from "react";

import { LaReunion } from "@/components/video/LaReunion";
import type { EstadoDeLaVentana } from "@/lib/ventana-de-reunion";

/**
 * La reunión en su propia pestaña, para quien entra por el enlace.
 *
 * # Por qué aquí solo hay DOS tamaños
 *
 * Los cuatro estados son de la ventana **dentro de la plataforma**, donde la
 * reunión flota encima de otra cosa. Aquí no hay otra cosa: la reunión **es**
 * la pestaña. Así que:
 *
 * - `pastilla` dejaría una página en blanco con una barra flotando encima,
 * - `panel` sería una ventana flotando sobre nada,
 *
 * y las dos se leen igual: como que la página se rompió. Quedan `maximizada`
 * —que aquí es simplemente «la pestaña»— y `completa`, que sí aporta: quita el
 * navegador de alrededor cuando alguien comparte pantalla y lo que importa es
 * el píxel.
 *
 * Y por eso esto es un componente y no un `useState` suelto en la página: la
 * página es de servidor —tiene su `metadata` y su `robots`— y el estado de la
 * ventana es del navegador.
 *
 * **Nada se recuerda aquí**, al revés que en la plataforma: `localStorage` es
 * por dominio, así que guardar el tamaño desde una reunión abierta por un
 * invitado le pisaría el suyo a quien use la plataforma en ese mismo navegador.
 * Y no hace falta: esta pestaña se abre para una reunión y se cierra con ella.
 */
export function ReunionPublica({ codigo }: { codigo: string }) {
    const [ventana, setVentana] = useState<EstadoDeLaVentana>("maximizada");

    return (
        <LaReunion
            codigo={codigo}
            ventana={ventana}
            onVentana={setVentana}
            estadosQueOfrece={["maximizada", "completa"]}
        />
    );
}
