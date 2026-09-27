"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdvisorAccount, isAdvisorAdmin } from "@/lib/permissions";
import { lasCuentasQueConsultaElCrm } from "@/lib/cuentas-del-crm";
import { laCalidadDeLasCuentas, laUltimaEvaluacion } from "@/lib/calidad-db";
import { evaluarLaCalidadDeLaCuenta, porQueNoSePuedeEvaluar } from "@/lib/calidad-runner.server";
import { agruparPorAsesor, type CalidadDeUnAsesor, type ConversacionEvaluada } from "@/lib/calidad-de-conversaciones";

/**
 * CRM › Calidad: leer el QA de las conversaciones y pedir una evaluación.
 *
 * La puerta es la del CRM entero, y la MISMA que usan sus otras cinco vistas:
 * el layout de `/crm` saca a los agentes —esto expone la atención de todo el
 * equipo— y las cuentas salen de `lasCuentasQueConsultaElCrm`, o sea la propia
 * y las que cuelgan de ella, nunca la madre ni las hermanas. La lista que
 * llega del navegador **no decide a qué se llega**: se re-resuelve aquí.
 */
async function lasCuentasDeQuienMira(cuentasPedidas: unknown): Promise<{ cuentas: string[] } | { error: string }> {
    const user = await currentUser();
    if (!user?.id) return { error: "No autorizado." };
    if (isAdvisorAccount(user) && !isAdvisorAdmin(user)) return { error: "No autorizado." };
    const pedidas = Array.isArray(cuentasPedidas)
        ? cuentasPedidas.filter((c): c is string => typeof c === "string")
        : null;
    const cuentas = await lasCuentasQueConsultaElCrm(user.effectiveId, pedidas);
    return { cuentas };
}

export interface CalidadDelCrm {
    asesores: (CalidadDeUnAsesor & { nombre: string })[];
    conversaciones: (ConversacionEvaluada & { asesorNombre: string })[];
    ultimaEvaluacion: string | null;
}

const DIAS_PERMITIDOS = [7, 30, 90] as const;
/** Tope de filas que viajan al navegador. Por encima, las más recientes. */
const TOPE_DE_FILAS = 1000;

function nombreDelCajon(responsable: string): string {
    return responsable === "ia" ? "Agente IA" : "Sin asignar";
}

export async function calidadDelCrmAction(
    cuentasPedidas: unknown,
    dias: unknown,
): Promise<{ success: true; data: CalidadDelCrm } | { success: false; message: string }> {
    try {
        const r = await lasCuentasDeQuienMira(cuentasPedidas);
        if ("error" in r) return { success: false, message: r.error };
        const d = DIAS_PERMITIDOS.includes(Number(dias) as 7) ? Number(dias) : 30;
        const desde = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
        const [filas, ultima] = await Promise.all([
            laCalidadDeLasCuentas({ cuentas: r.cuentas, desde, tope: TOPE_DE_FILAS }),
            laUltimaEvaluacion(r.cuentas),
        ]);
        const ids = Array.from(new Set(filas.map((f) => f.asesorId).filter((x): x is string => Boolean(x))));
        const personas = ids.length
            ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
            : [];
        const nombre = new Map(personas.map((p) => [p.id, p.name?.trim() || p.email || "Asesor"]));
        const elNombre = (asesorId: string | null, responsable: string) =>
            asesorId ? nombre.get(asesorId) ?? "Asesor que ya no está" : nombreDelCajon(responsable);
        return {
            success: true,
            data: {
                asesores: agruparPorAsesor(filas).map((a) => ({ ...a, nombre: elNombre(a.asesorId, a.responsable) })),
                conversaciones: filas.map((f) => ({ ...f, asesorNombre: elNombre(f.asesorId, f.responsable) })),
                ultimaEvaluacion: ultima ? ultima.toISOString() : null,
            },
        };
    } catch (error) {
        // Un fallo aquí se vería como un tablero vacío: no puede ser mudo.
        console.error("[calidad] no se pudo leer la calidad del CRM", error);
        return { success: false, message: "No se pudo cargar la calidad de las conversaciones." };
    }
}

/**
 * «Evaluar ahora»: lo mismo que el corte semanal del reporte, pero para las
 * cuentas que se están mirando y en este momento. Va DE FONDO: son llamadas a la IA una
 * tras otra y tardan; la pantalla vuelve a preguntar un rato después.
 *
 * Gasta créditos de cada cuenta, así que el alcance se vuelve a resolver aquí
 * y no se acepta ninguna cuenta que no salga de ahí.
 */
export async function evaluarCalidadAhoraAction(
    cuentasPedidas: unknown,
): Promise<{ success: true; message: string } | { success: false; message: string }> {
    const r = await lasCuentasDeQuienMira(cuentasPedidas);
    if ("error" in r) return { success: false, message: r.error };
    const motivos = await Promise.all(r.cuentas.map(async (c) => ({ c, motivo: await porQueNoSePuedeEvaluar(c) })));
    const aEvaluar = motivos.filter((m) => m.motivo === null).map((m) => m.c);
    if (aEvaluar.length === 0) {
        const sinIa = motivos.some((m) => m.motivo === "sin_ia");
        return {
            success: false,
            message: sinIa
                ? "La cuenta no tiene una IA configurada (Perfil › API key), y sin ella no se puede evaluar."
                : "La cuenta no tiene créditos de IA para evaluar conversaciones.",
        };
    }
    void (async () => {
        for (const cuenta of aEvaluar) {
            try {
                const resultado = await evaluarLaCalidadDeLaCuenta(cuenta);
                console.info("[calidad] evaluación a pedido", resultado);
            } catch (error) {
                console.error("[calidad] la evaluación a pedido falló", cuenta, error);
            }
        }
    })();
    const omitidas = r.cuentas.length - aEvaluar.length;
    return {
        success: true,
        message:
            "Evaluando las conversaciones con mensajes nuevos. Actualiza en un par de minutos para ver el resultado." +
            (omitidas ? ` ${omitidas} cuenta${omitidas === 1 ? "" : "s"} sin IA o sin créditos se ${omitidas === 1 ? "queda" : "quedan"} fuera.` : ""),
    };
}
