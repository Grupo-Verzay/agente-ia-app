'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import type { LeadStatus } from '@prisma/client';

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
};

export async function getKanbanSessionsAction(): Promise<{
    success: boolean;
    data?: KanbanCard[];
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: 'No autorizado.' };

        const sessions = await db.session.findMany({
            where: { userId: user.id },
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
            leadScore: (s as any).leadScore ?? null,
            leadScoreReason: (s as any).leadScoreReason ?? null,
            leadScoredAt: (s as any).leadScoredAt?.toISOString() ?? null,
        }));

        return { success: true, data: cards };
    } catch {
        return { success: false, message: 'Error al cargar el tablero Kanban.' };
    }
}
