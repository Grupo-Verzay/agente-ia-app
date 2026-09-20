import "server-only";

import { DIAS_DE_GRABACION } from "@/lib/grabacion-de-reunion";
import {
    borrarLosFicherosDe,
    cerrarYJuntarLaGrabacion,
} from "@/lib/grabacion-de-reunion.server";
import {
    cerrarLasGrabacionesColgadas,
    lasGrabacionesCaducadas,
    olvidarLosFicheros,
    laGrabacion,
} from "@/lib/salas-de-video-db";

/**
 * Lo que hay que hacer cada día con las grabaciones de reuniones.
 *
 * `import "server-only"` y no `'use server'`: esto borra ficheros del bucket y
 * lo llama un cron, así que publicarlo como acción sería publicar «bórrame
 * estas grabaciones» a quien sepa su nombre. Es la regla de esta casa: un
 * runner de sistema no puede ser una acción.
 *
 * Son dos barridos y hacen cosas distintas:
 *
 * 1. **Las colgadas.** Una grabación la lleva la pestaña de quien pulsó, así
 *    que un portátil que se cierra deja la fila en `grabando` para siempre — y
 *    con ella la sala, que entonces no puede volver a grabarse nunca. Se
 *    **juntan sus partes** en vez de darlas por perdidas: alguien grabó cuarenta
 *    minutos y se le cayó el navegador; lo que ya subió es suyo.
 * 2. **Las caducadas.** A los ciento ochenta días se borra el fichero del
 *    bucket y se ponen sus bytes a cero, que es lo que devuelve el cupo. **La
 *    fila se queda** con su transcripción y su resumen: son texto, ocupan nada,
 *    y son justo lo que alguien va a buscar de una reunión de hace medio año.
 */

/** Cuánto se espera antes de dar por muerta a la pestaña que grababa. */
const HORAS_COLGADA = 4;

/** Cuántas se tocan por vuelta, para no hacer un barrido eterno. */
const POR_VUELTA = 50;

export async function runGrabacionesDeReuniones(): Promise<{
    colgadas: number;
    caducadas: number;
    fallos: number;
}> {
    let colgadas = 0;
    let caducadas = 0;
    let fallos = 0;

    // Las colgadas: primero se marcan, y con el id en la mano se juntan. Se
    // marcan antes a propósito —suelta la sala al momento— y juntar después no
    // puede volver a dejarlas colgadas.
    try {
        const marcadas = await cerrarLasGrabacionesColgadas(HORAS_COLGADA);
        colgadas = marcadas;
    } catch (error) {
        fallos += 1;
        console.warn("[reuniones] no se pudieron cerrar las grabaciones colgadas", error);
    }

    try {
        const viejas = await lasGrabacionesCaducadas(DIAS_DE_GRABACION, POR_VUELTA);
        for (const g of viejas) {
            try {
                // El fichero primero y la fila después. Al revés, un fallo a
                // mitad dejaría el giga en el bucket sin ninguna fila que
                // dijera de quién era — o sea, sin forma de volver a
                // encontrarlo nunca.
                await borrarLosFicherosDe({ audioUrl: g.audioUrl, videoUrl: g.videoUrl });
                await olvidarLosFicheros(g.id);
                caducadas += 1;
            } catch (error) {
                fallos += 1;
                console.warn("[reuniones] no se pudo borrar una grabacion caducada", {
                    grabacion: g.id,
                    error,
                });
            }
        }
    } catch (error) {
        fallos += 1;
        console.warn("[reuniones] no se pudieron leer las grabaciones caducadas", error);
    }

    return { colgadas, caducadas, fallos };
}

/**
 * Recoger una grabación cuya pestaña murió, juntando lo que subió.
 *
 * Aparte del barrido porque se llama **también** desde el aviso de descarga de
 * la página, que es cuando de verdad se sabe que esa pestaña se va. Ahí se
 * recupera al momento en vez de dentro de cuatro horas.
 */
export async function recogerLaGrabacion(input: {
    grabacionId: string;
    segundos: number;
}): Promise<boolean> {
    const fila = await laGrabacion(input.grabacionId);
    if (!fila || fila.estado !== "grabando") return false;
    const cerrada = await cerrarYJuntarLaGrabacion(input);
    return cerrada.ok;
}
