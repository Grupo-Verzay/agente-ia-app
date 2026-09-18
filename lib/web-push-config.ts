import "server-only";

/**
 * Las llaves VAPID, y por qué esto puede no estar puesto.
 *
 * Web Push necesita un par de llaves que identifican a ESTE servidor ante el
 * servicio de empuje del navegador (FCM, Mozilla, Apple). La privada firma cada
 * envío, así que **no puede vivir en el repo**: va en variables de entorno, y
 * la pública es la única que baja al navegador — para eso está.
 *
 * **Sin las variables, todo esto queda inerte.** `hayWebPush()` devuelve
 * `false` y ni se suscribe nadie ni se empuja nada; el sonido, la campanita y
 * el contador siguen exactamente igual. Es la condición que se pidió: que
 * desplegar esto antes de configurar las llaves no rompa nada.
 *
 * Cómo se generan (una vez, en cualquier máquina con este repo):
 *
 *     npx web-push generate-vapid-keys
 *
 * y sus dos valores van a `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.
 *
 * **Las llaves no se cambian a la ligera**: una suscripción está firmada contra
 * la pública con la que nació, así que al cambiarlas todas las que hay dejan de
 * valer y cada persona tiene que volver a activar los avisos. Por eso, además,
 * el navegador guarda la suya contra la pública con la que se suscribió y la
 * renueva sola si no coinciden (`laLlavePublicaAction`).
 */

export type LlavesVapid = {
    publica: string;
    privada: string;
    /** A quién reclamar si un envío da problemas. Un `mailto:` o una URL. */
    sujeto: string;
};

/** El sujeto por defecto. El estándar pide uno; cualquiera vale mientras sea alcanzable. */
const SUJETO_POR_DEFECTO = "mailto:soporte@verzay.com";

function limpio(v: string | undefined): string {
    return (v ?? "").trim();
}

/**
 * Las llaves, o `null` si no están puestas.
 *
 * Se leen en cada llamada a propósito: son baratas de leer y así no hay que
 * reiniciar nada si algún día se ponen con el contenedor arriba. Y hacen falta
 * **las dos**: con solo una, `web-push` revienta al firmar y eso sería un fallo
 * en mitad de un envío en vez de un «esto no está configurado».
 */
export function lasLlavesVapid(): LlavesVapid | null {
    const publica = limpio(process.env.VAPID_PUBLIC_KEY);
    const privada = limpio(process.env.VAPID_PRIVATE_KEY);
    if (!publica || !privada) return null;
    return {
        publica,
        privada,
        sujeto: limpio(process.env.VAPID_SUBJECT) || SUJETO_POR_DEFECTO,
    };
}

/** Si el empuje está configurado. Lo preguntan el envío y la acción que da la llave. */
export function hayWebPush(): boolean {
    return lasLlavesVapid() !== null;
}
