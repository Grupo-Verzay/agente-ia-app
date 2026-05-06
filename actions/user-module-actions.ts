'use server'

import { db } from '@/lib/db'

export async function getUserModuleIds(userId: string): Promise<{ success: boolean; data: string[] }> {
    try {
        const records = await db.userModule.findMany({
            where: { B: userId },
            select: { A: true },
        });
        return { success: true, data: records.map(r => r.A) };
    } catch (error) {
        console.error('getUserModuleIds error:', error);
        return { success: false, data: [] };
    }
}

export async function setUserModules(userId: string, moduleIds: string[]): Promise<{ success: boolean }> {
    try {
        await db.userModule.deleteMany({ where: { B: userId } });
        if (moduleIds.length > 0) {
            await db.userModule.createMany({
                data: moduleIds.map(moduleId => ({ A: moduleId, B: userId })),
            });
        }
        return { success: true };
    } catch (error) {
        console.error('setUserModules error:', error);
        return { success: false };
    }
}
