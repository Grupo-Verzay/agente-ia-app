'use server';

import { db } from '@/lib/db';
import type { LeadStatus } from '@prisma/client';
import { MAX_MEDIA_PER_STATUS } from '@/lib/crm-follow-up-media';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';

/**
 * Sin guarda ninguna: el `userId` llegaba del navegador y entraba directo al
 * `where` y al `create`. Es el H02 de siempre — y `createCrmFollowUpMedia` lo
 * recibe **dentro de un objeto**, que es uno de los tres casos que un barrido
 * por la firma no ve.
 */

export type CrmFollowUpMediaItem = {
    id: string;
    leadStatus: LeadStatus;
    name: string;
    description: string | null;
    url: string;
    mediaType: string;
    createdAt: Date;
};

export async function getCrmFollowUpMediaByStatus(
    userId: string,
    leadStatus: LeadStatus,
): Promise<{ success: boolean; data?: CrmFollowUpMediaItem[]; message?: string }> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const items = await db.crmFollowUpMedia.findMany({
            where: { userId: cuenta, leadStatus },
            orderBy: { createdAt: 'asc' },
            select: { id: true, leadStatus: true, name: true, description: true, url: true, mediaType: true, createdAt: true },
        });
        return { success: true, data: items };
    } catch (err: any) {
        return { success: false, message: err?.message ?? 'Error al cargar los medios.' };
    }
}

export async function createCrmFollowUpMedia(args: {
    userId: string;
    leadStatus: LeadStatus;
    name: string;
    description?: string;
    url: string;
    mediaType: string;
}): Promise<{ success: boolean; data?: CrmFollowUpMediaItem; message?: string }> {
    try {
        const cuenta = await laCuentaDeLaAccion(args.userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const count = await db.crmFollowUpMedia.count({
            where: { userId: cuenta, leadStatus: args.leadStatus },
        });
        if (count >= MAX_MEDIA_PER_STATUS) {
            return {
                success: false,
                message: `Límite alcanzado. Máximo ${MAX_MEDIA_PER_STATUS} archivos por estado.`,
            };
        }

        const item = await db.crmFollowUpMedia.create({
            data: {
                userId: cuenta,
                leadStatus: args.leadStatus,
                name: args.name.trim(),
                description: args.description?.trim() || null,
                url: args.url,
                mediaType: args.mediaType,
            },
            select: { id: true, leadStatus: true, name: true, description: true, url: true, mediaType: true, createdAt: true },
        });
        return { success: true, data: item };
    } catch (err: any) {
        return { success: false, message: err?.message ?? 'Error al guardar el medio.' };
    }
}

export async function deleteCrmFollowUpMedia(
    userId: string,
    id: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        await db.crmFollowUpMedia.deleteMany({ where: { id, userId: cuenta } });
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message ?? 'Error al eliminar el medio.' };
    }
}
