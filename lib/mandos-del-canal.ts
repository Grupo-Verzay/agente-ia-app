/**
 * Los mandos de la cabecera de un canal del chat de equipo: las DOS formas de
 * llamar y la reunión.
 *
 * Puro a propósito: lo usan la cabecera (cliente) y el banco. Con la lista
 * escrita en la pantalla no hay dónde comprobar la regla de abajo, que es
 * justo la que se rompió.
 *
 * # El fallo del que viene: dos mandos con el MISMO glifo
 *
 * El teléfono abría un menú con «Llamada de voz» y «Videollamada», y al lado
 * había un botón de cámara. Los dos glifos eran **literalmente el mismo icono**
 * —`Video` en la opción del menú y `Video as VideoCamara` en el botón— así que
 * desde fuera la cabecera decía «teléfono que despliega una cámara, y una
 * cámara al lado»: indistinguibles, y un clic de más para algo que se hace a
 * diario.
 *
 * Y la cámara **no** era la videollamada: era la REUNIÓN, que es otra cosa —una
 * sala con enlace público a la que entran hasta cuatro, sin timbrarle a nadie—.
 * Nada en la fila lo decía.
 *
 * > **En una fila de mandos, dos cosas distintas no pueden llevar el mismo
 * > glifo.** El menú se va —el teléfono llama de voz y la cámara hace la
 * > videollamada, las dos de un solo clic— y la reunión pasa a su propio glifo.
 * > Dejarla con la cámara sería el mismo fallo con otro nombre.
 *
 * Lo comprueba el banco como **invariante** y no caso a caso: si mañana se
 * añade un cuarto mando con un glifo que ya está, se pone en rojo.
 */

import type { TipoDeCanal } from "@/lib/canales-de-equipo";
import { type ModoDeLlamada } from "@/lib/modo-de-la-llamada";

/**
 * Un mando de la cabecera: los dos modos de llamada, más la reunión.
 *
 * Los dos primeros SON los modos de `lib/modo-de-la-llamada.ts` y no una
 * lista paralela: lo que se despacha al oyente es ese mismo valor, así que con
 * dos vocabularios uno diría `video` y el otro `videollamada` y la llamada
 * arrancaría en voz sin decir por qué (`comoModo` cae en voz ante lo que no
 * reconoce, que es el lado seguro y aquí sería el fallo).
 */
export type MandoDelCanal = ModoDeLlamada | "reunion";

/**
 * El glifo de cada mando, por su nombre y no por el componente.
 *
 * Una llave y no el icono de lucide para que esto siga siendo puro —y
 * comprobable sin navegador—: quién pinta qué lo decide la cabecera, y lo que
 * aquí se guarda es la promesa de que no se repite ninguno.
 */
export type GlifoDelMando = "telefono" | "camara" | "pantalla";

export const GLIFO_DEL_MANDO: Record<MandoDelCanal, GlifoDelMando> = {
    voz: "telefono",
    video: "camara",
    // Una PANTALLA y no una cámara. La reunión es un sitio al que se entra con
    // un enlace y donde se enseña algo; la cámara ya es la videollamada de al
    // lado. `Video` sigue siendo el glifo de Reuniones en su propia pantalla,
    // donde no hay ninguna llamada con la que confundirlo.
    reunion: "pantalla",
};

export const ROTULO_DEL_MANDO: Record<MandoDelCanal, string> = {
    voz: "Llamada de voz",
    video: "Videollamada",
    reunion: "Reunión de video",
};

/**
 * El color de cada mando al posar el cursor, en clases LITERALES.
 *
 * Literales porque Tailwind solo genera lo que ve escrito: una clase compuesta
 * en tiempo de ejecución no existiría en el CSS y el botón saldría sin color
 * con el build en verde (la familia de `removeConsole`). Y `lib/` entra en el
 * `content` de `tailwind.config.ts` — sin eso, esto no pinta nada.
 *
 * **Las dos llamadas comparten color y la reunión no**: son dos formas de lo
 * mismo, y la reunión es otra cosa. Es lo que hace que la fila se lea de un
 * vistazo sin abrir ningún menú.
 */
export const COLOR_DEL_MANDO: Record<MandoDelCanal, string> = {
    voz: "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40",
    video: "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40",
    reunion: "hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/40",
};

/**
 * Qué mandos ofrece la cabecera de un canal.
 *
 * **Llamar, SOLO en un directo**: un canal de varias personas no tiene «el
 * otro» y una llamada de uno a uno no sabría a quién sonarle. **La reunión, en
 * cualquiera**: es un sitio al que se entra, así que un canal de área es justo
 * donde tiene sentido.
 *
 * Esto es la fachada. La puerta de verdad sigue en las acciones: la llamada
 * comprueba que sea un directo y que quien llama pertenezca, y la reunión que
 * se PERTENEZCA al canal —no que se pueda leer—.
 */
export function losMandosDelCanal(tipo: TipoDeCanal): MandoDelCanal[] {
    return tipo === "directo" ? ["voz", "video", "reunion"] : ["reunion"];
}

/** Si un mando es una llamada —y entonces su nombre ES su modo— o la reunión. */
export function esUnaLlamada(mando: MandoDelCanal): mando is ModoDeLlamada {
    return mando !== "reunion";
}

/**
 * Lo que oye quien no ve el icono.
 *
 * Con el nombre del canal dentro, que es lo que dice a quién se llama o dónde
 * se abre la reunión: «Videollamada» a secas, con tres botones seguidos, no
 * distingue una fila de otra.
 */
export function elAvisoDelMando(mando: MandoDelCanal, nombre: string): string {
    return `${ROTULO_DEL_MANDO[mando]} ${esUnaLlamada(mando) ? "con" : "en"} ${nombre}`;
}
