"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolverLasCuentasDelCrm } from "@/lib/cuentas-del-crm";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { esLineaDeWhatsappQr } from "@/lib/linea-de-whatsapp";
import { lasOpcionesDeLlamada, type OpcionDeLlamada } from "@/lib/cuentas-para-llamar";

/**
 * Las cuentas por las que quien mira puede llamar desde el marcador de
 * CRM › Llamadas (ver `lib/cuentas-para-llamar.ts`).
 *
 * El alcance es EL MISMO que el filtro del CRM (`resolverLasCuentasDelCrm`): la
 * propia y lo que cuelga de ella hacia abajo; un `agente`, solo la suya; el
 * superadministrador de verdad, la familia entera. Esto solo decide qué se
 * OFRECE — la puerta de verdad sigue en `laCuentaDeLaLlamada`, que re-comprueba
 * con `assertCanAccessTargetUser` la línea que llegue del navegador.
 */
export async function cuentasParaLlamarAction(): Promise<
    { success: true; opciones: OpcionDeLlamada[] } | { success: false; message: string }
> {
    const me = await currentUser();
    if (!me?.id) return { success: false, message: "No autorizado." };
    const propia = (me as { effectiveId?: string | null }).effectiveId ?? me.ownerId ?? me.id;

    try {
        const alcance = await resolverLasCuentasDelCrm(propia);
        const ids = alcance.puedeElegir
            ? alcance.disponibles.map((c) => c.id)
            : [alcance.propia];

        const [filas, lineas] = await Promise.all([
            db.user.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true, company: true, email: true, astraCallsSid: true },
            }),
            db.instancia.findMany({
                where: { userId: { in: ids } },
                orderBy: { id: "asc" },
                select: { userId: true, instanceName: true, instanceType: true },
            }),
        ]);

        // La misma regla que `laLineaDeWhatsappDeLaCuenta`: la primera por QR
        // en orden de `id`, sea del proveedor que sea.
        const qrDe = new Map<string, string>();
        for (const l of lineas) {
            if (l.userId && !qrDe.has(l.userId) && esLineaDeWhatsappQr(l.instanceType)) {
                qrDe.set(l.userId, l.instanceName);
            }
        }

        const opciones = lasOpcionesDeLlamada(
            filas.map((f) => ({
                id: f.id,
                nombre: nombreDeLaCuenta(f) || f.id,
                esLaPropia: f.id === alcance.propia,
                lineaQr: qrDe.get(f.id) ?? null,
                tieneNumero: Boolean(f.astraCallsSid),
            })),
        );
        return { success: true, opciones };
    } catch (error) {
        console.warn("[llamadas] no se pudieron leer las cuentas para llamar", {
            cuenta: propia,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, message: "No se pudieron cargar las cuentas." };
    }
}
