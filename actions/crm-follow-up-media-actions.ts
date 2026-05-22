'use server';

import { db } from '@/lib/db';
import type { LeadStatus } from '@prisma/client';
import { MAX_MEDIA_PER_STATUS } from '@/lib/crm-follow-up-media';

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
        const items = await db.crmFollowUpMedia.findMany({
            where: { userId, leadStatus },
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
        const count = await db.crmFollowUpMedia.count({
            where: { userId: args.userId, leadStatus: args.leadStatus },
        });
        if (count >= MAX_MEDIA_PER_STATUS) {
            return {
                success: false,
                message: `Límite alcanzado. Máximo ${MAX_MEDIA_PER_STATUS} archivos por estado.`,
            };
        }

        const item = await db.crmFollowUpMedia.create({
            data: {
                userId: args.userId,
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
        await db.crmFollowUpMedia.deleteMany({ where: { id, userId } });
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message ?? 'Error al eliminar el medio.' };
    }
}
