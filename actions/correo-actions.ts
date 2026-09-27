"use server";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import {
    comoDatosDeImap,
    comoTextoDeLaRespuesta,
    hayLlavesDe,
    type CorreoCompleto,
    type ProveedorConBoton,
} from "@/lib/correo";
import { elBuzonDe, guardarElBuzon, losBuzonesDe, quitarElBuzon, type BuzonVisible } from "@/lib/correo-db";
import { elProveedorDe, ErrorDeCorreo, probarImap, type Pagina } from "@/lib/correo-proveedores.server";

/**
 * Las acciones de Correo.
 *
 * # De quién es: el id de la PERSONA no llega nunca del navegador
 *
 * Ninguna recibe un `userId`. La persona sale de la sesión
 * (`laPersonaQueActua`) y **todo buzón se busca con ella en el `WHERE`**
 * (`elBuzonDe`). Lo que sí llega es el id del BUZÓN, y con el de otra persona
 * contesta exactamente lo mismo que con uno inventado: «no está».
 *
 * Y no pasa por `laCuentaDeLaAccion` ni por `assertCanAccessTargetUser`, a
 * propósito: esas resuelven un ALCANCE —a qué cuentas llego— y el correo no lo
 * tiene. Es de quien lo conectó, y de nadie más: ni el dueño de la cuenta, ni
 * un administrador, ni el súper administrador lo ven.
 *
 * # Y no toca nada de Chats
 *
 * Ni `persistChatMessage`, ni `Session`, ni el reparto de asesores, ni las
 * marcas de leído de la bandeja. Lo comprueba el barrido de
 * `lib/__tests__/correo.test.mjs`, que falla si este fichero o los de `lib/`
 * importan cualquiera de esos caminos.
 */
async function laPersona(): Promise<{ id: string; cuentaId: string | null } | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    const persona = laPersonaQueActua(user as any);
    if (!persona.id) return null;
    // Solo para saber desde qué cuenta se conectó: no decide ningún acceso.
    const u = user as { ownerId?: string | null; id: string };
    return { id: persona.id, cuentaId: u.ownerId ?? u.id };
}

type Resultado<T> = ({ success: true } & T) | { success: false; message: string; reconectar?: boolean };

function fallo(error: unknown, contexto: string): { success: false; message: string; reconectar?: boolean } {
    if (error instanceof ErrorDeCorreo) {
        console.warn(`[correo] ${contexto}`, error.message);
        return { success: false, message: error.message, reconectar: error.reconectar };
    }
    // Un fallo aquí no puede ser mudo: se ve como una bandeja vacía.
    console.error(`[correo] ${contexto}`, error);
    return { success: false, message: "No se pudo completar. Inténtalo de nuevo." };
}

export async function misBuzonesAction(): Promise<
    Resultado<{ buzones: BuzonVisible[]; conBoton: Record<ProveedorConBoton, boolean> }>
> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        return {
            success: true,
            buzones: await losBuzonesDe(persona.id),
            conBoton: { gmail: hayLlavesDe("gmail", process.env), outlook: hayLlavesDe("outlook", process.env) },
        };
    } catch (error) {
        return fallo(error, "no se pudieron leer los buzones");
    }
}

async function elMio(buzonId: unknown) {
    const persona = await laPersona();
    if (!persona) return { error: "No autorizado." as const };
    if (typeof buzonId !== "string" || !buzonId) return { error: "Ese correo no está conectado." as const };
    const buzon = await elBuzonDe(persona.id, buzonId);
    if (!buzon) return { error: "Ese correo no está conectado." as const };
    return { buzon };
}

export async function bandejaAction(buzonId: unknown, cursor: unknown): Promise<Resultado<Pagina>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (r.buzon.estado === "reconectar") {
            return { success: false, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
        }
        const pagina = await elProveedorDe(r.buzon).bandeja(r.buzon, typeof cursor === "string" && cursor ? cursor : null);
        return { success: true, ...pagina };
    } catch (error) {
        return fallo(error, "no se pudo leer la bandeja");
    }
}

export async function leerCorreoAction(buzonId: unknown, correoId: unknown): Promise<Resultado<{ correo: CorreoCompleto }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        const correo = await elProveedorDe(r.buzon).leer(r.buzon, correoId);
        return { success: true, correo };
    } catch (error) {
        return fallo(error, "no se pudo abrir el correo");
    }
}

/**
 * Responder. A quién y con qué asunto lo decide el SERVIDOR leyendo el
 * original: el navegador manda el texto y el id, nunca el destinatario. Si no,
 * «responder» sería una forma de mandar correo a quien uno quiera desde el
 * buzón conectado.
 */
export async function responderCorreoAction(
    buzonId: unknown,
    correoId: unknown,
    texto: unknown,
): Promise<Resultado<{ enviado: true }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        const cuerpo = comoTextoDeLaRespuesta(texto);
        if (!cuerpo) return { success: false, message: "Escribe algo antes de responder." };
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        const proveedor = elProveedorDe(r.buzon);
        const original = await proveedor.leer(r.buzon, correoId);
        if (!original.responderA) return { success: false, message: "Ese correo no dice a quién responder." };
        await proveedor.responder(r.buzon, original, cuerpo);
        return { success: true, enviado: true };
    } catch (error) {
        return fallo(error, "no se pudo responder");
    }
}

/** Conectar un correo de dominio propio. Se PRUEBA antes de guardar: entrada y salida. */
export async function conectarImapAction(raw: unknown): Promise<Resultado<{ buzon: BuzonVisible }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const v = comoDatosDeImap((raw ?? {}) as Record<string, unknown>);
        if (!v.ok) return { success: false, message: v.motivo };
        const { direccion, ...resto } = v.datos;
        const credenciales = { tipo: "imap" as const, ...resto };
        await probarImap(credenciales);
        const id = await guardarElBuzon({
            personaId: persona.id,
            cuentaId: persona.cuentaId,
            proveedor: "imap",
            direccion,
            nombre: null,
            credenciales,
        });
        const buzon = (await losBuzonesDe(persona.id)).find((b) => b.id === id)!;
        return { success: true, buzon };
    } catch (error) {
        return fallo(error, "no se pudo conectar el correo de dominio propio");
    }
}

export async function desconectarCorreoAction(buzonId: unknown): Promise<Resultado<{ quitado: true }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        if (typeof buzonId !== "string" || !buzonId) return { success: false, message: "Ese correo no está conectado." };
        const quitado = await quitarElBuzon(persona.id, buzonId);
        if (!quitado) return { success: false, message: "Ese correo no está conectado." };
        return { success: true, quitado: true };
    } catch (error) {
        return fallo(error, "no se pudo desconectar el correo");
    }
}
