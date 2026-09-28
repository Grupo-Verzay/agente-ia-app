"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";
import { comoSeCerro, loQueSePublica, type Actualizacion } from "@/lib/actualizaciones";
import {
    cuantasLaVieron,
    laPendienteDe,
    lasActualizaciones,
    marcarVista,
    publicarActualizacion,
    retirarActualizacion,
} from "@/lib/actualizaciones-db";

/**
 * Las ACTUALIZACIONES de la plataforma.
 *
 * # Publicar y retirar son de la CASA
 *
 * Lo que se publica aquí le salta a TODA la plataforma, así que no es de una
 * cuenta: pasa por `quienMandaEnLaCasa`, la misma puerta que los planes y los
 * métodos de pago. Esconder la tarjeta no cerraría nada: una acción de
 * servidor ES un endpoint.
 *
 * # Ver y cerrar son de la PERSONA, y el id no llega del navegador
 *
 * `miActualizacionPendienteAction` y `marcarActualizacionVistaAction` no
 * reciben ningún `userId`: la persona sale de la sesión. Lo único que llega es
 * el id de la actualización, y marcarla solo escribe una fila a nombre de quien
 * la mira.
 */

function elBucket() {
    return { publicUrl: process.env.S3_PUBLIC_URL, nombre: process.env.S3_BUCKET_NAME || "verzay-media" };
}

export async function puedoPublicarActualizacionesAction(): Promise<boolean> {
    const user = await currentUser();
    if (!user) return false;
    return Boolean(await quienMandaEnLaCasa("actualizaciones:puede"));
}

export async function listarActualizacionesAction(): Promise<{
    success: boolean;
    data: (Actualizacion & { vistas: number })[];
    message?: string;
}> {
    try {
        const quien = await quienMandaEnLaCasa("actualizaciones:listar");
        if (!quien) return { success: false, data: [], message: "No autorizado." };
        const lista = await lasActualizaciones();
        const vistas = await cuantasLaVieron(lista.map((a) => a.id));
        return { success: true, data: lista.map((a) => ({ ...a, vistas: vistas[a.id] ?? 0 })) };
    } catch (error) {
        console.error("[actualizaciones] no se pudo leer la lista", error);
        return { success: false, data: [], message: "No se pudieron cargar las actualizaciones." };
    }
}

export async function publicarActualizacionAction(pedido: {
    texto?: unknown;
    archivo?: unknown;
}): Promise<{ success: boolean; data?: Actualizacion; message?: string }> {
    try {
        const quien = await quienMandaEnLaCasa("actualizaciones:publicar");
        if (!quien) return { success: false, message: "No autorizado." };

        const decision = loQueSePublica(pedido, elBucket());
        if (!decision.ok) return { success: false, message: decision.motivo };

        const persona = laPersonaQueActua(quien);
        const publicada = await publicarActualizacion({
            id: randomUUID(),
            texto: decision.texto,
            archivo: decision.archivo,
            publicadaPorId: persona.id,
            publicadaPorNombre: persona.nombre ?? null,
        });
        revalidatePath("/documentation/actualizaciones");
        return { success: true, data: publicada };
    } catch (error) {
        console.error("[actualizaciones] no se pudo publicar", error);
        return { success: false, message: "No se pudo publicar la actualización." };
    }
}

export async function retirarActualizacionAction(id: unknown): Promise<{ success: boolean; message?: string }> {
    try {
        const quien = await quienMandaEnLaCasa("actualizaciones:retirar");
        if (!quien) return { success: false, message: "No autorizado." };
        if (typeof id !== "string" || !id) return { success: false, message: "Actualización no válida." };
        const borrada = await retirarActualizacion(id);
        if (!borrada) return { success: false, message: "Esa actualización ya no existe." };
        revalidatePath("/documentation/actualizaciones");
        return { success: true };
    } catch (error) {
        console.error("[actualizaciones] no se pudo retirar", error);
        return { success: false, message: "No se pudo retirar la actualización." };
    }
}

/** La que le toca ver a quien abre la plataforma, o `null`. */
export async function miActualizacionPendienteAction(): Promise<Actualizacion | null> {
    try {
        const user = await currentUser();
        if (!user?.id) return null;
        const persona = laPersonaQueActua(user);
        return await laPendienteDe(persona.id);
    } catch (error) {
        // Que no salga la ventana no puede tumbar la plataforma, pero tampoco
        // es mudo: una actualización que nadie ve se lee como que no se publicó.
        console.error("[actualizaciones] no se pudo leer la pendiente", error);
        return null;
    }
}

export async function marcarActualizacionVistaAction(
    actualizacionId: unknown,
    como: unknown,
): Promise<{ success: boolean }> {
    try {
        const user = await currentUser();
        if (!user?.id || typeof actualizacionId !== "string" || !actualizacionId) return { success: false };
        const persona = laPersonaQueActua(user);
        await marcarVista(persona.id, actualizacionId, comoSeCerro(como));
        return { success: true };
    } catch (error) {
        console.error("[actualizaciones] no se pudo marcar como vista", error);
        return { success: false };
    }
}
