'use server';

import { SIN_GRUPOS } from '@/lib/conversaciones-de-grupo';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { lasCuentasQueConsultaElCrm } from '@/lib/cuentas-del-crm';
import type { LeadStatus } from '@prisma/client';
import { laVe } from '@/lib/personales';
import { lasDuenasDeEtiquetas, quienVeLoPersonal } from '@/lib/personales-db';

export type KanbanCard = {
    id: number;
    pushName: string;
    remoteJid: string;
    leadStatus: LeadStatus | null;
    leadStatusReason: string | null;
    leadStatusUpdatedAt: string | null;
    tags: { id: number; name: string; color: string | null; slug: string }[];
    pendingFollowUps: number;
    leadScore: number | null;
    leadScoreReason: string | null;
    leadScoredAt: string | null;
    assignedAdvisorId: string | null;
    /**
     * La cuenta a la que pertenece la tarjeta.
     *
     * Baja siempre, unificado o no: la insignia se decide al pintar con
     * `elCrmVaUnificado`, y el gate de «esta fila es de otra cuenta» necesita el
     * dueño — **sin dueño no es ajena**, así que un campo opcional dejaría el
     * arrastre abierto sobre tarjetas que la acción luego rechaza.
     */
    cuentaId: string;
};

export async function getKanbanSessionsAction(
    /**
     * Las cuentas que el filtro tiene puestas. Se re-resuelven en el servidor:
     * una acción ES un endpoint y esta lista llega del navegador.
     */
    cuentasPedidas?: readonly string[] | null,
): Promise<{
    success: boolean;
    data?: KanbanCard[];
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: 'No autorizado.' };

        // Este tablero lo pintan TRES pantallas —el CRM, `/tags` y `/asesores`—
        // y **solo la del CRM unifica**. `lasCuentasQueConsultaElCrm` sin
        // parámetro devuelve TODAS las de la familia, así que llamarla a secas
        // pondría de golpe las tarjetas de las cuentas hijas en dos tableros
        // que nadie tocó, sin un solo error. Sin parámetro se contesta con la
        // cuenta propia, que es exactamente lo que esas dos enseñaban antes.
        const cuentas = cuentasPedidas
            ? await lasCuentasQueConsultaElCrm(user.effectiveId, cuentasPedidas)
            : [user.effectiveId];

        const sessions = await db.session.findMany({
            where: { userId: { in: cuentas }, ...SIN_GRUPOS },
            include: {
                sessionTags: { include: { tag: true } },
                crmFollowUps: {
                    where: { status: 'PENDING' },
                    select: { id: true },
                },
            },
            orderBy: [
                { updatedAt: 'desc' },
            ],
        });

        // Las etiquetas PERSONALES de otro asesor no se le enseñan a un asesor
        // (`lib/personales.ts`). Quien manda lo ve todo y no paga la consulta.
        const quien = await quienVeLoPersonal();
        if (quien && !quien.manda) {
            const duenas = await lasDuenasDeEtiquetas(
                sessions.flatMap((s) => s.sessionTags.map((st) => st.tagId)),
            );
            if (duenas.size > 0) {
                for (const s of sessions) {
                    s.sessionTags = s.sessionTags.filter((st) => laVe(duenas.get(st.tagId), quien));
                }
            }
        }

        const cards: KanbanCard[] = sessions.map((s) => ({
            id: s.id,
            pushName: s.pushName,
            remoteJid: s.remoteJid,
            leadStatus: s.leadStatus,
            leadStatusReason: s.leadStatusReason,
            leadStatusUpdatedAt: s.leadStatusUpdatedAt?.toISOString() ?? null,
            tags: s.sessionTags.map((st) => ({
                id: st.tag.id,
                name: st.tag.name,
                color: st.tag.color,
                slug: st.tag.slug,
            })),
            pendingFollowUps: s.crmFollowUps.length,
            leadScore: s.leadScore ?? null,
            leadScoreReason: s.leadScoreReason ?? null,
            leadScoredAt: s.leadScoredAt?.toISOString() ?? null,
            assignedAdvisorId: s.assignedAdvisorId ?? null,
            cuentaId: s.userId,
        }));

        return { success: true, data: cards };
    } catch {
        return { success: false, message: 'Error al cargar el tablero Kanban.' };
    }
}
