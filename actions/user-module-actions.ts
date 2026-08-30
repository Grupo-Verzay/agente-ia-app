'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdminOrReseller } from '@/lib/rbac'

/**
 * Quién puede tocar los módulos de otra cuenta: la plataforma (admin, super
 * admin), un reseller sobre los suyos, y el administrador de un equipo —que es
 * quien reparte permisos entre su gente—.
 *
 * Un colaborador con clientes asignados NO entra: a él se le pasa una cuenta
 * para que entre a arreglarla, y ocultarle el botón no basta si la acción se
 * puede llamar igual desde el navegador.
 */
async function puedeGestionarModulos() {
    const me = await currentUser()
    if (!me?.id) return false
    if (isAdminOrReseller(me.role)) return true
    return !!me.ownerId && me.advisorRole === 'administrador'
}

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
        if (!(await puedeGestionarModulos())) return { success: false }

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
