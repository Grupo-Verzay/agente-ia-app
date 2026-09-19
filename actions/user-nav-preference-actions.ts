'use server'

import { db } from '@/lib/db'
import crypto from 'crypto'
import type { UserNavPref } from '@/types/nav-preference'
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion'

/**
 * Sin guarda: el `userId` llegaba del navegador y entraba directo al `WHERE` de
 * un `$executeRaw` que **borra** y vuelve a escribir. O sea que con la sesión de
 * cualquier cuenta y otro id se le reordenaba —o se le vaciaba— el menú a otra.
 */

export async function getUserNavPreferences(userId: string): Promise<{ success: boolean; data: UserNavPref[] }> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, data: [] };

        const rows = await db.$queryRaw<UserNavPref[]>`
            SELECT "moduleId", "displayLabel", "isHidden", "sortOrder"
            FROM "UserNavPreference"
            WHERE "userId" = ${cuenta}
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
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false };

        await db.$executeRaw`DELETE FROM "UserNavPreference" WHERE "userId" = ${cuenta}`;
        for (const pref of prefs) {
            const id = crypto.randomUUID();
            await db.$executeRaw`
                INSERT INTO "UserNavPreference" ("id", "userId", "moduleId", "displayLabel", "isHidden", "sortOrder")
                VALUES (${id}, ${cuenta}, ${pref.moduleId}, ${pref.displayLabel ?? null}, ${pref.isHidden}, ${pref.sortOrder})
            `;
        }
        return { success: true };
    } catch (error) {
        console.error('saveUserNavPreferences error:', error);
        return { success: false };
    }
}
