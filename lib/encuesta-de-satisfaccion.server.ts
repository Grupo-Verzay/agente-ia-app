import "server-only";

import { db } from "@/lib/db";
import { esConversacionDeGrupo } from "@/lib/conversaciones-de-grupo";
import { esLineaDeWhatsappQr } from "@/lib/linea-de-whatsapp";
import { laClaveDelServidorDeLaCuenta } from "@/lib/clave-del-servidor.server";
import { enviarConHistorial } from "@/lib/envio-con-historial.server";
import { elMensajeDeLaEncuesta, elNegocioDeLaCuenta } from "@/lib/encuesta-de-satisfaccion";
import {
    leerLosAjustesDeLaEncuesta,
    marcarLaEncuestaEnviada,
    marcarLaEncuestaFallida,
    reservarLaEncuesta,
} from "@/lib/encuesta-de-satisfaccion-db";

/**
 * Manda la encuesta de satisfacción de UNA conversación que se acaba de
 * resolver.
 *
 * **Se llama desde `resolveSession` y desde ningún otro sitio**: es la única
 * puerta por la que se resuelve una conversación —el botón de la cabecera, el
 * menú de la fila, el lote y la macro `RESOLVE` pasan todos por ella—, así que
 * colgarla ahí cubre las cuatro sin escribirla cuatro veces.
 *
 * Sin puerta propia a propósito: quien llama ya comprobó que puede resolver esa
 * conversación. Y la línea, la clave y el destinatario salen de la FILA, nunca
 * del navegador.
 */

export type ResultadoDeLaEncuesta =
    | { estado: "enviada" }
    | { estado: "omitida"; motivo: string }
    | { estado: "fallida"; motivo: string };

/** Un contacto al que se le puede preguntar: una persona, no un grupo ni una difusión. */
function esUnaPersona(remoteJid: string): boolean {
    const jid = remoteJid.trim().toLowerCase();
    if (!jid) return false;
    if (esConversacionDeGrupo(jid)) return false;
    return !/@(broadcast|newsletter)$/.test(jid);
}

/**
 * La encuesta va por WhatsApp: una línea por QR (Evolution o Waha) o la API
 * oficial de Meta en su canal de WhatsApp. Telegram, Facebook e Instagram no:
 * mandar ahí «responde con un número» no tiene el mismo sentido y el despachador
 * no sabe enviarles.
 */
function esLineaDeWhatsapp(linea: { instanceType: string | null; metaChannel: string | null }): boolean {
    if (esLineaDeWhatsappQr(linea.instanceType)) return true;
    const tipo = String(linea.instanceType ?? "").trim().toLowerCase();
    const canal = String(linea.metaChannel ?? "").trim().toLowerCase();
    return tipo === "meta" && (!canal || canal === "whatsapp");
}

export async function mandarLaEncuestaDeSatisfaccion(
    sessionId: number,
    asesorId: string | null,
): Promise<ResultadoDeLaEncuesta> {
    const sesion = await db.session.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true, remoteJid: true, remoteJidAlt: true, instanceId: true },
    });
    if (!sesion) return { estado: "omitida", motivo: "La conversación no existe." };

    // El interruptor es de la cuenta DUEÑA de la conversación, no de quien
    // resuelve: la madre resolviendo una conversación de su hija manda (o no)
    // según lo que haya decidido la hija.
    const ajustes = await leerLosAjustesDeLaEncuesta(sesion.userId);
    if (!ajustes.activa) return { estado: "omitida", motivo: "La encuesta está apagada en esta cuenta." };

    if (!esUnaPersona(sesion.remoteJid)) {
        return { estado: "omitida", motivo: "Es un grupo o una difusión: no hay a quién preguntarle." };
    }

    // La línea de la conversación, por su FILA y de su cuenta: la respuesta
    // tiene que salir por el número con el que el cliente habló.
    const linea = await db.instancia.findFirst({
        where: {
            userId: sesion.userId,
            OR: [{ instanceName: sesion.instanceId }, { instanceId: sesion.instanceId }],
        },
        select: { instanceName: true, instanceType: true, metaChannel: true, userId: true },
    });
    if (!linea?.instanceName) {
        return { estado: "omitida", motivo: "La conversación no tiene una línea conectada." };
    }
    if (!esLineaDeWhatsapp(linea)) {
        return { estado: "omitida", motivo: "La línea no es de WhatsApp." };
    }

    const identidades = Array.from(
        new Set([sesion.remoteJid, sesion.remoteJidAlt].map((j) => String(j ?? "").trim()).filter(Boolean)),
    );
    const id = await reservarLaEncuesta({
        cuentaId: sesion.userId,
        sessionId: sesion.id,
        instanceName: linea.instanceName,
        remoteJid: sesion.remoteJid,
        identidades,
        asesorId: asesorId || null,
    });
    if (!id) return { estado: "omitida", motivo: "Esta conversación ya recibió una encuesta hace poco." };

    const cuenta = await db.user.findUnique({
        where: { id: linea.userId },
        select: { company: true },
    });
    const mensaje = elMensajeDeLaEncuesta(elNegocioDeLaCuenta(cuenta?.company));

    const servidor = await laClaveDelServidorDeLaCuenta(linea.userId);
    const url = servidor
        ? `${servidor.url}/message/sendText/${encodeURIComponent(linea.instanceName)}`
        : undefined;

    // La hora de ANTES de mandar: la respuesta del cliente llega después, así
    // que con esto no se puede quedar fuera por un segundo de reloj.
    const antes = new Date();
    try {
        const res = await enviarConHistorial({
            instanceName: linea.instanceName,
            remoteJid: sesion.remoteJid,
            message: mensaje,
            url,
            apikey: servidor?.key,
            historyType: "notification",
            additionalKwargs: { source: "encuesta-satisfaccion", recipient: "client" },
        });
        if (!res.success) {
            const motivo = String(("error" in res && res.error) || res.message || "No se pudo enviar.");
            await marcarLaEncuestaFallida(id, motivo);
            console.warn("[encuesta] no salió", { sessionId, linea: linea.instanceName, motivo });
            return { estado: "fallida", motivo };
        }
        await marcarLaEncuestaEnviada(id, antes);
        return { estado: "enviada" };
    } catch (error) {
        const motivo = String((error as Error)?.message ?? error);
        await marcarLaEncuestaFallida(id, motivo).catch(() => undefined);
        console.warn("[encuesta] reventó al enviar", { sessionId, motivo });
        return { estado: "fallida", motivo };
    }
}

/**
 * La cola del proceso: las encuestas salen DE UNA EN UNA.
 *
 * Resolver en lote cuarenta conversaciones no puede lanzar cuarenta envíos a la
 * vez por la misma línea —es lo que hace que WhatsApp la mire con lupa— y no
 * puede hacer esperar a quien resolvió: el lote contesta en cuanto termina de
 * resolver y las encuestas van saliendo detrás. Una que falla no para a las
 * demás, y no es muda.
 */
let cola: Promise<unknown> = Promise.resolve();

export function encolarLaEncuestaDeSatisfaccion(sessionId: number, asesorId: string | null): void {
    cola = cola
        .then(() => mandarLaEncuestaDeSatisfaccion(sessionId, asesorId))
        .then((r) => {
            if (r.estado === "enviada") console.info("[encuesta] enviada", { sessionId });
        })
        .catch((error) => console.warn("[encuesta] no se pudo mandar", { sessionId, error: String(error) }));
}
