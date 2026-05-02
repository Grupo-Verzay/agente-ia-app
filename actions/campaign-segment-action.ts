"use server";

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

    const [scores, sessionTags, tags] = await Promise.all([
        db.$queryRaw<SegmentScore[]>`
            SELECT id, lead_score FROM "Session" WHERE "userId" = ${user.id}
        `,
        db.$queryRaw<SegmentSessionTag[]>`
            SELECT st."sessionId", st."tagId"
            FROM "SessionTag" st
            INNER JOIN "Session" s ON s.id = st."sessionId"
            WHERE s."userId" = ${user.id}
        `,
        db.tag.findMany({
            where: { userId: user.id },
            select: { id: true, name: true, color: true },
            orderBy: { name: 'asc' },
        }),
    ]);

    return { scores, sessionTags, tags };
}
