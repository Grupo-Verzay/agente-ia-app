"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laCuentaQueConfigura } from "@/lib/cuenta-que-configura";
import { lasCuentasQueConsultaElCrm } from "@/lib/cuentas-del-crm";
import { laCuentaDeLaConversacion } from "@/lib/dueno-del-dato.server";
import {
    ENCUESTA_POR_DEFECTO,
    elMensajeDeLaEncuesta,
    elNegocioDeLaCuenta,
    elNpsPorAsesor,
    elResumenNps,
    laCategoria,
    type AjustesDeLaEncuesta,
    type CategoriaNps,
    type EstadoDeLaEncuesta,
    type ResumenNps,
    type ResumenNpsDelAsesor,
} from "@/lib/encuesta-de-satisfaccion";
import {
    guardarLosAjustesDeLaEncuesta,
    lasEncuestasDeLaSesion,
    lasFilasDelNps,
    leerLosAjustesDeLaEncuesta,
    recogerLasRespuestas,
} from "@/lib/encuesta-de-satisfaccion-db";

/**
 * Las acciones de la ENCUESTA DE SATISFACCIÓN.
 *
 * Tres puertas, y cada una es la de siempre para su pregunta:
 *
 * - el interruptor es un ajuste DE LA CUENTA: `laCuentaQueConfigura` (dueño y
 *   administrador sí, un `agente` no), igual que el escalado de al lado;
 * - el NPS del CRM alcanza lo que alcanza el CRM: `lasCuentasQueConsultaElCrm`,
 *   hacia abajo y nunca hacia arriba;
 * - la ficha de un contacto pasa por `laCuentaDeLaConversacion`, que es la de
 *   cualquier dato colgado de una conversación.
 *
 * Ninguna acepta un `userId` del navegador.
 */

type Resultado = { success: boolean; message?: string };

/**
 * Lo que tiene puesto la cuenta y el mensaje EXACTO que recibiría el cliente,
 * armado con la misma función que lo manda. Nunca falla: si no se puede leer,
 * apagada.
 */
export async function getAjustesDeLaEncuesta(): Promise<AjustesDeLaEncuesta & { mensaje: string }> {
    const cuenta = await laCuentaQueConfigura();
    if (!cuenta) return { ...ENCUESTA_POR_DEFECTO, mensaje: elMensajeDeLaEncuesta(null) };
    const [ajustes, fila] = await Promise.all([
        leerLosAjustesDeLaEncuesta(cuenta.id),
        db.user.findUnique({ where: { id: cuenta.id }, select: { company: true } }).catch(() => null),
    ]);
    return { ...ajustes, mensaje: elMensajeDeLaEncuesta(elNegocioDeLaCuenta(fila?.company)) };
}

export async function guardarEncuestaActiva(activa: boolean): Promise<Resultado> {
    const cuenta = await laCuentaQueConfigura();
    if (!cuenta) return { success: false, message: "No autorizado." };
    if (typeof activa !== "boolean") return { success: false, message: "Valor no válido." };
    try {
        await guardarLosAjustesDeLaEncuesta(cuenta.id, activa);
        revalidatePath("/profile");
        return {
            success: true,
            message: activa
                ? "Encuesta de satisfacción activada."
                : "Encuesta de satisfacción desactivada.",
        };
    } catch (error) {
        console.error("[encuesta] no se pudo guardar el interruptor", error);
        return { success: false, message: "No se pudo guardar." };
    }
}

/** El nombre de cada persona que atendió, para la tabla y la ficha. */
async function losNombresDeLosAsesores(ids: (string | null)[]): Promise<Map<string, string>> {
    const unicos = Array.from(new Set(ids.filter((i): i is string => Boolean(i))));
    const nombres = new Map<string, string>();
    if (unicos.length === 0) return nombres;
    const filas = await db.user.findMany({
        where: { id: { in: unicos } },
        select: { id: true, name: true, email: true },
    });
    for (const f of filas) nombres.set(f.id, (f.name ?? "").trim() || (f.email ?? "").trim() || "Asesor");
    return nombres;
}

export type NpsDelAsesor = ResumenNpsDelAsesor & { nombre: string };

export type NpsDelCrm = {
    resumen: ResumenNps;
    porAsesor: NpsDelAsesor[];
    enviadas: number;
    /** `null` sin encuestas enviadas: un 0 % sobre nada se leería como «nadie contesta». */
    tasaDeRespuesta: number | null;
};

const NPS_VACIO: NpsDelCrm = {
    resumen: elResumenNps([]),
    porAsesor: [],
    enviadas: 0,
    tasaDeRespuesta: null,
};

export async function getNpsDelCrm(params?: {
    days?: number;
    cuentas?: readonly string[] | null;
}): Promise<NpsDelCrm> {
    const me = await currentUser();
    if (!me?.effectiveId) return NPS_VACIO;

    const cuentas = await lasCuentasQueConsultaElCrm(me.effectiveId, params?.cuentas);
    const days = Math.min(Math.max(Number(params?.days) || 30, 1), 365);
    const desde = new Date(Date.now() - days * 86_400_000);

    try {
        // La respuesta no llega sola: se va a buscar al leer (ver
        // `recogerLasRespuestas`). Lo que se contestó desde la última vez
        // entra antes de contar.
        await recogerLasRespuestas({ cuentas });
        const { respondidas, enviadas } = await lasFilasDelNps(cuentas, desde);
        const resumen = elResumenNps(respondidas.map((r) => r.puntuacion));
        const porAsesorCrudo = elNpsPorAsesor(respondidas);
        const nombres = await losNombresDeLosAsesores(porAsesorCrudo.map((a) => a.asesorId));
        return {
            resumen,
            porAsesor: porAsesorCrudo.map((a) => ({
                ...a,
                nombre: a.asesorId ? nombres.get(a.asesorId) ?? "Asesor" : "Sin asesor (IA)",
            })),
            enviadas,
            tasaDeRespuesta: enviadas > 0 ? Math.round((resumen.respuestas / enviadas) * 100) : null,
        };
    } catch (error) {
        console.error("[encuesta] no se pudo calcular el NPS", error);
        return NPS_VACIO;
    }
}

export type EncuestaDelContacto = {
    id: string;
    estado: EstadoDeLaEncuesta;
    puntuacion: number | null;
    categoria: CategoriaNps | null;
    asesor: string | null;
    enviadaEn: string | null;
    respondidaEn: string | null;
    motivo: string | null;
};

/** Las encuestas de una conversación, para su ficha. */
export async function getEncuestasDelContactoAction(
    sessionId: number,
): Promise<{ success: boolean; encuestas: EncuestaDelContacto[] }> {
    const dueno = await laCuentaDeLaConversacion(sessionId);
    if (!dueno) return { success: false, encuestas: [] };
    try {
        await recogerLasRespuestas({ sessionId: dueno.sesion.id });
        const filas = await lasEncuestasDeLaSesion(dueno.sesion.id);
        const nombres = await losNombresDeLosAsesores(filas.map((f) => f.asesorId));
        return {
            success: true,
            encuestas: filas.map((f) => ({
                id: f.id,
                estado: f.estado,
                puntuacion: f.puntuacion,
                categoria: f.puntuacion !== null ? laCategoria(f.puntuacion) : null,
                asesor: f.asesorId ? nombres.get(f.asesorId) ?? null : null,
                enviadaEn: f.enviadaEn ? f.enviadaEn.toISOString() : null,
                respondidaEn: f.respondidaEn ? f.respondidaEn.toISOString() : null,
                motivo: f.motivo,
            })),
        };
    } catch (error) {
        console.warn("[encuesta] no se pudieron leer las de la conversación", { sessionId, error: String(error) });
        return { success: false, encuestas: [] };
    }
}
