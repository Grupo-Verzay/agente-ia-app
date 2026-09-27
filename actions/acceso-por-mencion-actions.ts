"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { laCuentaDeLaConversacion } from "@/lib/dueno-del-dato.server";
import {
    elAccesoPorMencion,
    losAccesosDeLaConversacion,
    quitarAccesoPorMencion,
} from "@/lib/acceso-por-mencion-db";
import {
    porQueVeLaConversacion,
    puedeQuitarElAcceso,
    type MotivoDeAcceso,
} from "@/lib/acceso-por-mencion";

/**
 * Las tres acciones del acceso por mención: verlo, quitarlo y preguntar por
 * qué alguien ve una conversación.
 *
 * Las tres pasan antes por `laCuentaDeLaConversacion`: el dueño sale de la
 * FILA y se pregunta con la puerta de siempre. «No existe» y «no es tuya» se
 * contestan igual.
 *
 * Y la persona sale de la sesión (`laPersonaQueActua`), nunca del navegador:
 * ninguna acción acepta un «soy fulano». Lo que sí llega es a QUIÉN se le quita
 * el acceso, y eso se comprueba con `puedeQuitarElAcceso`.
 */

type Quien = {
    id: string;
    ownerId?: string | null;
    advisorRole?: string | null;
    sessionUserId?: string;
    canTakeUnassigned?: boolean | null;
};

/** Lo que sale del navegador en crudo: un id de conversación. */
function comoIdDeConversacion(valor: unknown): number | null {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/** Manda en la cuenta: dueño o administrador. Un agente participa, no manda. */
function mandaEnLaCuenta(user: Quien): boolean {
    return !user.ownerId || user.advisorRole === "administrador";
}

async function elAsignado(sessionId: number): Promise<string | null> {
    const filas = await db.$queryRaw<{ asignado: string | null }[]>`
        SELECT assigned_advisor_id AS asignado FROM "Session" WHERE id = ${sessionId}
    `;
    return filas[0]?.asignado ?? null;
}

export type AccesoParaPintar = {
    personaId: string;
    nombre: string | null;
    otorgadoPorNombre: string | null;
    creadoEn: string;
    /** Quien mira puede quitarlo (dueño, quien administra, quien lo dio o el propio). */
    sePuedeQuitar: boolean;
};

export async function accesosPorMencionAction(
    sessionId: number,
): Promise<{ success: boolean; data: AccesoParaPintar[]; message?: string }> {
    try {
        const user = (await currentUser()) as Quien | null;
        if (!user?.id) return { success: false, data: [], message: "No autorizado." };
        const id = comoIdDeConversacion(sessionId);
        if (!id || !(await laCuentaDeLaConversacion(id))) {
            return { success: false, data: [], message: "Conversación no encontrada." };
        }

        const accesos = await losAccesosDeLaConversacion(id);
        if (!accesos.length) return { success: true, data: [] };

        const ids = Array.from(
            new Set(accesos.flatMap((a) => [a.personaId, a.otorgadoPorId]).filter(Boolean) as string[]),
        );
        const gente = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        const nombre = new Map(gente.map((g) => [g.id, g.name]));

        const yo = laPersonaQueActua(user).id;
        const asignadoA = await elAsignado(id);
        const manda = mandaEnLaCuenta(user);

        return {
            success: true,
            data: accesos.map((a) => ({
                personaId: a.personaId,
                nombre: nombre.get(a.personaId) ?? null,
                otorgadoPorNombre: a.otorgadoPorId ? nombre.get(a.otorgadoPorId) ?? null : null,
                creadoEn: a.creadoEn.toISOString(),
                sePuedeQuitar: puedeQuitarElAcceso({
                    personaId: yo,
                    mandaEnLaCuenta: manda,
                    asignadoA,
                    otorgadoPorId: a.otorgadoPorId,
                    delAcceso: a.personaId,
                }),
            })),
        };
    } catch (error) {
        console.error("[accesosPorMencionAction]", error);
        return { success: false, data: [], message: "No se pudieron cargar los accesos." };
    }
}

export async function quitarAccesoPorMencionAction(
    sessionId: number,
    personaId: string,
): Promise<{ success: boolean; message: string }> {
    try {
        const user = (await currentUser()) as Quien | null;
        if (!user?.id) return { success: false, message: "No autorizado." };
        const id = comoIdDeConversacion(sessionId);
        const persona = typeof personaId === "string" ? personaId.trim() : "";
        if (!id || !persona || !(await laCuentaDeLaConversacion(id))) {
            return { success: false, message: "Conversación no encontrada." };
        }

        const acceso = await elAccesoPorMencion(id, persona);
        // Ya no estaba: no es un error, es que otro se adelantó o se resolvió.
        if (!acceso) return { success: true, message: "Esa persona ya no tenía acceso." };

        const permitido = puedeQuitarElAcceso({
            personaId: laPersonaQueActua(user).id,
            mandaEnLaCuenta: mandaEnLaCuenta(user),
            asignadoA: await elAsignado(id),
            otorgadoPorId: acceso.otorgadoPorId,
            delAcceso: persona,
        });
        if (!permitido) {
            console.warn("[acceso por mención] quitar rechazado", { sessionId: id, persona });
            return { success: false, message: "Solo el dueño de la conversación puede quitar ese acceso." };
        }

        await quitarAccesoPorMencion(id, persona);
        return { success: true, message: "Acceso quitado." };
    } catch (error) {
        console.error("[quitarAccesoPorMencionAction]", error);
        return { success: false, message: "No se pudo quitar el acceso." };
    }
}

/**
 * Por qué quien mira ve esta conversación. Lo pregunta la pantalla cuando un
 * agente tiene delante una que no es suya, para decidir si la enseña como
 * invitado o si el acceso que traía ya no está.
 */
export async function accesoALaConversacionAction(
    sessionId: number,
): Promise<{ success: boolean; motivo: MotivoDeAcceso | null; otorgadoPorNombre?: string | null }> {
    try {
        const user = (await currentUser()) as Quien | null;
        if (!user?.id) return { success: false, motivo: null };
        const id = comoIdDeConversacion(sessionId);
        if (!id || !(await laCuentaDeLaConversacion(id))) return { success: true, motivo: null };

        const yo = laPersonaQueActua(user).id;
        const esAgente = Boolean(user.ownerId) && user.advisorRole === "agente";
        if (!esAgente) return { success: true, motivo: "cuenta" };

        const [asignadoA, participante, acceso] = await Promise.all([
            elAsignado(id),
            (db as any).sessionParticipant.findUnique({
                where: { sessionId_userId: { sessionId: id, userId: yo } },
                select: { id: true },
            }),
            elAccesoPorMencion(id, yo),
        ]);

        const motivo = porQueVeLaConversacion({
            esAgente,
            personaId: yo,
            asignadoA,
            puedeTomarSinAsignar: user.canTakeUnassigned ?? true,
            esParticipante: Boolean(participante),
            mencionVigente: Boolean(acceso),
        });

        let otorgadoPorNombre: string | null = null;
        if (motivo === "mencion" && acceso?.otorgadoPorId) {
            const quien = await db.user.findUnique({
                where: { id: acceso.otorgadoPorId },
                select: { name: true },
            });
            otorgadoPorNombre = quien?.name ?? null;
        }
        return { success: true, motivo, otorgadoPorNombre };
    } catch (error) {
        // Mudo aquí se vería como una puerta que se cierra sola.
        console.error("[accesoALaConversacionAction]", error);
        return { success: false, motivo: null };
    }
}
