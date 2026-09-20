"use client";

import { useState } from "react";

import { LaReunion } from "@/components/video/LaReunion";
import type { EstadoDeLaVentana } from "@/lib/ventana-de-reunion";

/**
 * La reunión en su propia pestaña, para quien entra por el enlace.
 *
 * # Por qué aquí solo hay DOS tamaños
 *
 * Los tres estados son de la ventana **dentro de la plataforma**, donde la
 * reunión se abre encima de otra cosa. Aquí no hay otra cosa: la reunión **es**
 * la pestaña, así que `pastilla` dejaría una página en blanco con una barra
 * flotando encima — que se lee como que la página se rompió.
 *
 * Quedan `maximizada` —que aquí es simplemente «la pestaña»— y `completa`, que
 * sí aporta: quita el navegador de alrededor cuando alguien comparte pantalla
 * y lo que importa es el píxel.
 *
 * Y por eso esto es un componente y no un `useState` suelto en la página: la
 * página es de servidor —tiene su `metadata` y su `robots`— y el estado de la
 * ventana es del navegador.
 *
 * **Nada se recuerda**, ni aquí ni en la plataforma: de los tres estados solo
 * `maximizada` se podría restaurar, que es ya el valor por defecto. Está
 * contado en `lib/ventana-de-reunion.ts`.
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
