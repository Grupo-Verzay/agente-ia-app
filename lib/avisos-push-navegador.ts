/**
 * El lado del NAVEGADOR del empuje: registrar, suscribir y dar de baja.
 *
 * Vive aparte del botón a propósito: son cuatro cosas que el navegador hace de
 * una forma muy concreta —registrar el service worker, convertir la llave,
 * comparar la suscripción que ya hubiera, darla de baja en los dos sitios— y
 * metidas dentro del componente no se pueden leer ni reutilizar.
 *
 * **Nada de esto es el interruptor.** El interruptor sigue viviendo en el
 * `localStorage` de ESTE dispositivo, porque el permiso es del navegador. Esto
 * es lo que hace que además llegue con la pestaña cerrada.
 */

import {
    desuscribirAction,
    laLlavePublicaAction,
    suscribirAction,
} from "@/actions/avisos-push-actions";

/**
 * La llave pública viaja en base64url y `pushManager` la quiere en bytes.
 *
 * Los dos reemplazos no son adorno: base64url cambia `+` por `-` y `/` por `_`,
 * y sin deshacerlo la llave se decodifica mal y la suscripción se rechaza con
 * un error que no dice nada de esto.
 */
function laLlaveEnBytes(base64url: string): Uint8Array {
    const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
    const base64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
    const crudo = atob(base64);
    const bytes = new Uint8Array(crudo.length);
    for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
    return bytes;
}

function comoBase64Url(buffer: ArrayBuffer | null | undefined): string {
    if (!buffer) return "";
    const bytes = new Uint8Array(buffer);
    let texto = "";
    for (let i = 0; i < bytes.length; i += 1) texto += String.fromCharCode(bytes[i]);
    return btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function hayEmpujeEnEsteNavegador(): boolean {
    return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window
    );
}

/**
 * El service worker, listo.
 *
 * `register` es idempotente: llamarlo con el mismo fichero no monta un segundo
 * trabajador. Y se espera a `ready` porque recién registrado todavía no hay
 * `pushManager` con el que suscribirse.
 */
async function elTrabajador(): Promise<ServiceWorkerRegistration | null> {
    if (!hayEmpujeEnEsteNavegador()) return null;
    try {
        await navigator.serviceWorker.register("/sw.js");
        return await navigator.serviceWorker.ready;
    } catch (error) {
        console.warn("[push] no se pudo registrar el service worker", error);
        return null;
    }
}

/**
 * Suscribe este dispositivo y lo guarda contra la persona.
 *
 * Devuelve si quedó suscrito **para avisos con la plataforma cerrada**. Un
 * `false` no es un fallo del botón: puede ser simplemente que las llaves VAPID
 * todavía no estén puestas en el servidor, y entonces los avisos siguen
 * funcionando con la pestaña abierta, que es lo que había antes.
 *
 * La parte que no es obvia: **si ya hay una suscripción con OTRA llave, se da
 * de baja y se rehace**. Una suscripción está firmada contra la llave con la
 * que nació, así que después de cambiar las VAPID la vieja no vale y el empuje
 * fallaría siempre — sin que nadie viera un error.
 */
export async function suscribirEsteDispositivo(): Promise<boolean> {
    if (!hayEmpujeEnEsteNavegador()) return false;
    try {
        const respuesta = await laLlavePublicaAction();
        const llave = respuesta.success ? respuesta.data.llave : null;
        if (!llave) {
            // No es un error que enseñar: es «esto todavía no está
            // configurado». Se dice en la consola y se sigue.
            console.info("[push] los avisos con la plataforma cerrada no están configurados");
            return false;
        }

        const registro = await elTrabajador();
        if (!registro) return false;

        let suscripcion = await registro.pushManager.getSubscription();
        if (suscripcion) {
            const suya = comoBase64Url(
                suscripcion.options?.applicationServerKey as ArrayBuffer | null,
            );
            if (suya && suya !== llave) {
                await suscripcion.unsubscribe().catch(() => undefined);
                suscripcion = null;
            }
        }

        if (!suscripcion) {
            suscripcion = await registro.pushManager.subscribe({
                // Obligatorio: sin esto el navegador rechaza la suscripción.
                // Un empuje silencioso —sin notificación visible— no se permite.
                userVisibleOnly: true,
                applicationServerKey: laLlaveEnBytes(llave) as BufferSource,
            });
        }

        const json = suscripcion.toJSON() as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
        };
        const res = await suscribirAction({
            endpoint: json.endpoint ?? "",
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
        });
        if (!res.success) {
            console.warn("[push] no se pudo guardar la suscripción", res.message);
            return false;
        }
        return true;
    } catch (error) {
        console.warn("[push] no se pudo suscribir este dispositivo", error);
        return false;
    }
}

/**
 * Da de baja este dispositivo, en los DOS sitios.
 *
 * Primero en el servidor y después en el navegador, y ese orden importa: si se
 * hiciera al revés y el servidor fallara, la fila se quedaría en la base
 * apuntando a una suscripción que ya no existe — y entonces el empuje seguiría
 * saliendo hasta que el servicio contestara `410`. Al derecho, lo peor que
 * puede pasar es una suscripción de navegador huérfana, a la que ya no se
 * empuja nada.
 */
export async function darDeBajaEsteDispositivo(): Promise<void> {
    if (!hayEmpujeEnEsteNavegador()) return;
    try {
        const registro = await navigator.serviceWorker.getRegistration();
        const suscripcion = await registro?.pushManager.getSubscription();
        if (!suscripcion) return;
        await desuscribirAction(suscripcion.endpoint);
        await suscripcion.unsubscribe().catch(() => undefined);
    } catch (error) {
        console.warn("[push] no se pudo dar de baja este dispositivo", error);
    }
}
