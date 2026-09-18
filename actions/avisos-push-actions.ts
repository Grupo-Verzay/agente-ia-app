"use server";

import { currentUser } from "@/lib/auth";
import { quienFirma } from "@/lib/chat-de-equipo";
import { hayWebPush, lasLlavesVapid } from "@/lib/web-push-config";
import {
    darDeBajaLaSuscripcion,
    guardarLaSuscripcion,
} from "@/lib/suscripciones-push-db";

/**
 * Las tres puertas del empuje: dar la llave, suscribirse y darse de baja.
 *
 * **Quién es la persona lo decide el SERVIDOR**, con `quienFirma` —el mismo
 * reparto del chat de equipo y de la jornada—: si el navegador pudiera decir a
 * nombre de quién se suscribe, cualquiera se colaría en los avisos de otro. Y
 * es la PERSONA, no la cuenta efectiva: dentro de una cuenta ajena con
 * «Ingresar» los avisos siguen siendo de quien está sentado delante.
 *
 * Un fichero `'use server'` **solo exporta funciones asíncronas**. Los tipos
 * `export type` sí pueden quedarse: se borran al compilar.
 */

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

export type SuscripcionDelNavegador = {
    endpoint: string;
    p256dh: string;
    auth: string;
};

async function laPersona(): Promise<string | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    return quienFirma(user)?.personaId ?? null;
}

function comoTexto(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

/**
 * La llave pública con la que el navegador se suscribe.
 *
 * `null` cuando no están puestas las variables, y eso **no es un error**: es la
 * plataforma diciendo «esto todavía no está configurado». El navegador lo usa
 * para no ofrecer un botón que no puede funcionar, que es peor que no tenerlo.
 */
export async function laLlavePublicaAction(): Promise<
    Respuesta<{ llave: string | null }>
> {
    try {
        if (!(await laPersona())) return { success: false, message: "No autorizado." };
        return { success: true, data: { llave: lasLlavesVapid()?.publica ?? null } };
    } catch (error) {
        console.warn("[push] no se pudo leer la llave pública", error);
        return { success: false, message: "No se pudo comprobar los avisos." };
    }
}

/**
 * Guarda el dispositivo de quien llama.
 *
 * Se llama **cada vez que se encienden los avisos**, no solo la primera: el
 * navegador puede renovar la suscripción por su cuenta, y el `ON CONFLICT` del
 * `endpoint` hace que volver a guardarla sea refrescarla, no duplicarla.
 */
export async function suscribirAction(
    suscripcion: SuscripcionDelNavegador,
): Promise<Respuesta<{ guardada: true }>> {
    try {
        const personaId = await laPersona();
        if (!personaId) return { success: false, message: "No autorizado." };
        if (!hayWebPush()) {
            return { success: false, message: "Los avisos no están configurados." };
        }

        const endpoint = comoTexto(suscripcion?.endpoint);
        const p256dh = comoTexto(suscripcion?.p256dh);
        const auth = comoTexto(suscripcion?.auth);
        if (!endpoint || !p256dh || !auth) {
            // No es mudo: un botón que se enciende y no avisa nunca se lee como
            // que los avisos no funcionan, y no hay nada que mirar.
            console.warn("[push] llegó una suscripción incompleta", {
                tieneEndpoint: Boolean(endpoint),
                tieneP256dh: Boolean(p256dh),
                tieneAuth: Boolean(auth),
            });
            return { success: false, message: "El navegador no dio una suscripción válida." };
        }

        await guardarLaSuscripcion({ personaId, endpoint, p256dh, auth });
        return { success: true, data: { guardada: true } };
    } catch (error) {
        console.warn("[push] no se pudo guardar la suscripción", error);
        return { success: false, message: "No se pudieron activar los avisos." };
    }
}

/**
 * Da de baja este dispositivo.
 *
 * Es lo que se pidió: **apagar los avisos da de baja la suscripción**, no solo
 * apaga un interruptor en el navegador. Si solo se apagara en local, el empuje
 * seguiría llegando al teléfono de quien lo apagó desde el portátil.
 */
export async function desuscribirAction(
    endpoint: string,
): Promise<Respuesta<{ dadaDeBaja: true }>> {
    try {
        const personaId = await laPersona();
        if (!personaId) return { success: false, message: "No autorizado." };
        const limpio = comoTexto(endpoint);
        if (!limpio) return { success: true, data: { dadaDeBaja: true } };
        await darDeBajaLaSuscripcion({ personaId, endpoint: limpio });
        return { success: true, data: { dadaDeBaja: true } };
    } catch (error) {
        console.warn("[push] no se pudo dar de baja la suscripción", error);
        return { success: false, message: "No se pudieron apagar los avisos." };
    }
}
