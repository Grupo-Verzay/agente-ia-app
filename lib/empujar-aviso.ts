import "server-only";

import webpush from "web-push";

import { comoTextoDeAviso } from "@/lib/aviso-del-equipo";
import { hayWebPush, lasLlavesVapid } from "@/lib/web-push-config";
import {
    losDispositivosDeVarias,
    olvidarLaSuscripcion,
    seUso,
} from "@/lib/suscripciones-push-db";

/**
 * Empujar un aviso a la persona con la plataforma CERRADA.
 *
 * Es lo único que el sonido y la campanita no podían hacer: los dos necesitan
 * una pestaña abierta. Esto se lo entrega el sistema operativo al service
 * worker, que lo pinta aunque el navegador esté de fondo.
 *
 * **Y no hace falta tocar el backend**, que es otro repositorio, por un motivo
 * que no es obvio: el mensaje del equipo se escribe en una **acción de servidor
 * de esta App**, así que el empujón puede salir de ahí mismo.
 *
 * Sus límites, que se dicen antes de prometer nada:
 *
 * - En **iOS** solo funciona con la App **instalada** como PWA. Desde Safari a
 *   secas no hay manera, y no es cosa nuestra.
 * - En **escritorio** el navegador tiene que estar corriendo aunque sea de
 *   fondo. Con el navegador cerrado del todo no llega nada hasta que se vuelve
 *   a abrir — entonces el servicio de empuje entrega lo que tenía guardado.
 */

export type AvisoQueSeEmpuja = {
    /** El titular. Quién escribió. */
    titulo: string;
    /** El cuerpo. El texto del mensaje, ya recortado. */
    texto: string;
    /** A dónde lleva el clic. Una ruta de la App. */
    url: string;
    /**
     * Para agrupar. Dos avisos con la misma etiqueta se sustituyen en vez de
     * apilarse: cinco mensajes de la misma conversación son una notificación,
     * no cinco — que es justo lo que se aprende a despachar sin leer.
     */
    etiqueta: string;
};

let configurado = false;

function configurar(): boolean {
    const llaves = lasLlavesVapid();
    if (!llaves) return false;
    if (!configurado) {
        webpush.setVapidDetails(llaves.sujeto, llaves.publica, llaves.privada);
        configurado = true;
    }
    return true;
}

/** Lo que contesta un servicio de empuje cuando la suscripción ya no vale. */
function estaMuerta(error: unknown): boolean {
    const codigo = (error as { statusCode?: number })?.statusCode;
    return codigo === 404 || codigo === 410;
}

/**
 * Empuja un aviso a todos los dispositivos de esta gente.
 *
 * Cuatro cosas que hay que mantener:
 *
 * 1. **Nunca lanza.** El mensaje ya está guardado cuando se llama, así que un
 *    fallo aquí no puede deshacerlo ni tumbar el envío. Pero **no es mudo**: un
 *    aviso que no sale sin decirlo se lee como «a mí no me llega nada», que es
 *    el fallo del que viene todo esto.
 * 2. **Sin llaves no hace nada y no se queja.** Es la condición que se pidió:
 *    desplegar esto antes de configurar las variables no puede romper ni
 *    ensuciar nada.
 * 3. **Una consulta para toda la gente**, no una por persona. Un directo son
 *    dos y una mención pueden ser diez; diez consultas para leer lo mismo es
 *    «muchas peticiones pequeñas son turno, no trabajo», por dentro.
 * 4. **Lo que caduca se borra en el momento.** Un `404` o un `410` es el
 *    servicio de empuje diciendo que esa dirección ya no existe; sin borrarla,
 *    cada mensaje la vuelve a intentar para siempre.
 */
export async function empujarAviso(
    personaIds: string[],
    aviso: AvisoQueSeEmpuja,
): Promise<{ enviados: number; caducados: number }> {
    const vacio = { enviados: 0, caducados: 0 };
    if (!personaIds.length) return vacio;
    if (!hayWebPush()) return vacio;

    try {
        if (!configurar()) return vacio;

        const dispositivos = await losDispositivosDeVarias(personaIds);
        if (!dispositivos.length) return vacio;

        const carga = JSON.stringify({
            titulo: aviso.titulo,
            texto: comoTextoDeAviso(aviso.texto),
            url: aviso.url,
            etiqueta: aviso.etiqueta,
        });

        const vivos: string[] = [];
        const muertos: string[] = [];

        // En paralelo y cada uno en su casilla: con `Promise.all` un solo
        // rechazo —una suscripción caducada, que es lo normal— tiraría los
        // envíos buenos que ya estaban resueltos.
        const idas = await Promise.allSettled(
            dispositivos.map(async (d) => {
                await webpush.sendNotification(
                    {
                        endpoint: d.endpoint,
                        keys: { p256dh: d.p256dh, auth: d.auth },
                    },
                    carga,
                    // Cuánto lo guarda el servicio de empuje si el navegador
                    // está cerrado. Un día: pasado eso, el mensaje ya se leyó
                    // por otro camino y avisar es ruido.
                    { TTL: 60 * 60 * 24 },
                );
                return d.endpoint;
            }),
        );

        idas.forEach((r, i) => {
            const endpoint = dispositivos[i].endpoint;
            if (r.status === "fulfilled") {
                vivos.push(endpoint);
                return;
            }
            if (estaMuerta(r.reason)) {
                muertos.push(endpoint);
                return;
            }
            console.warn("[push] no se pudo empujar un aviso", {
                codigo: (r.reason as { statusCode?: number })?.statusCode,
                motivo: (r.reason as { message?: string })?.message,
            });
        });

        // Best-effort las dos: ni marcar lo vivo ni limpiar lo muerto puede
        // tumbar un envío que ya salió.
        await Promise.allSettled([
            vivos.length ? seUso(vivos) : Promise.resolve(),
            ...muertos.map((e) => olvidarLaSuscripcion(e)),
        ]);

        if (vivos.length || muertos.length) {
            console.info("[push] avisos empujados", {
                gente: personaIds.length,
                dispositivos: dispositivos.length,
                enviados: vivos.length,
                caducados: muertos.length,
            });
        }

        return { enviados: vivos.length, caducados: muertos.length };
    } catch (error) {
        console.warn("[push] no se pudieron empujar los avisos", error);
        return vacio;
    }
}
