'use server'

import { db } from '@/lib/db'
import crypto from 'crypto'
import type { UserNavPref } from '@/types/nav-preference'

export async function getUserNavPreferences(userId: string): Promise<{ success: boolean; data: UserNavPref[] }> {
    try {
        const rows = await db.$queryRaw<UserNavPref[]>`
            SELECT "moduleId", "displayLabel", "isHidden", "sortOrder"
            FROM "UserNavPreference"
            WHERE "userId" = ${userId}
            ORDER BY "sortOrder" ASC
        `;
        return { success: true, data: rows };
    } catch {
        return { success: false, data: [] };
    }
}

export async function saveUserNavPreferences(
    userId: string,
    prefs: UserNavPref[]
): Promise<{ success: boolean }> {
    try {
        await db.$executeRaw`DELETE FROM "UserNavPreference" WHERE "userId" = ${userId}`;
        for (const pref of prefs) {
            const id = crypto.randomUUID();
            await db.$executeRaw`
                INSERT INTO "UserNavPreference" ("id", "userId", "moduleId", "displayLabel", "isHidden", "sortOrder")
                VALUES (${id}, ${userId}, ${pref.moduleId}, ${pref.displayLabel ?? null}, ${pref.isHidden}, ${pref.sortOrder})
            `;
        }
        return { success: true };
    } catch (error) {
        console.error('saveUserNavPreferences error:', error);
        return { success: false };
    }
}
