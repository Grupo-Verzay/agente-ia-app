"use server";

import { sinGruposSql } from '@/lib/conversaciones-de-grupo';
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export type SegmentScore = { id: number; lead_score: number | null };
export type SegmentSessionTag = { sessionId: number; tagId: number };
export type SegmentTag = { id: number; name: string; color: string | null };

export async function getCampaignSegmentData(): Promise<{
    scores: SegmentScore[];
    sessionTags: SegmentSessionTag[];
    tags: SegmentTag[];
}> {
    const user = await currentUser();
    if (!user?.id) return { scores: [], sessionTags: [], tags: [] };
    // La CUENTA activa, la misma con la que la página trae los leads. Con el id
    // de la persona, a alguien del equipo le salían sin puntaje ni etiquetas y
    // el segmento no encontraba a nadie.
    const cuenta = user.effectiveId ?? user.id;

    const [scores, sessionTags, tags] = await Promise.all([
        db.$queryRaw<SegmentScore[]>`
            SELECT id, lead_score FROM "Session" s WHERE s."userId" = ${cuenta} ${sinGruposSql('s')}
        `,
        db.$queryRaw<SegmentSessionTag[]>`
            SELECT st."sessionId", st."tagId"
            FROM "SessionTag" st
            INNER JOIN "Session" s ON s.id = st."sessionId"
            WHERE s."userId" = ${cuenta}
        `,
        db.tag.findMany({
            where: { userId: cuenta },
            select: { id: true, name: true, color: true },
            orderBy: { name: 'asc' },
        }),
    ]);

    return { scores, sessionTags, tags };
}
