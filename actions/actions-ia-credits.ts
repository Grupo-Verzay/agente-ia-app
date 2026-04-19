'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isAdminLike } from '@/lib/rbac';
import { IaCredit } from '@prisma/client';


interface IaCreditResponse {
  success: boolean;
  message: string;
  data?: IaCredit[];
}

// Obtener créditos por usuario
export async function getIaCreditByUser(userId: string): Promise<IaCreditResponse> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    if (!userId) {
      return { success: false, message: 'userId es requerido' };
    }

    const record = await db.iaCredit.findUnique({
      where: { userId },
    });

    if (!record) {
      return { success: false, message: 'No se encontraron créditos para este usuario' };
    }

    return { success: true, message: 'Créditos encontrados', data: [record] };
  } catch (error) {
    console.error('[GET_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al obtener créditos de IA' };
  }
}

// Crear créditos para un usuario
export async function createIaCreditForUser(
  userId: string,
  total: number,
  renewalDate: Date,
  used?: number
): Promise<IaCreditResponse> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    if (!userId || total == null || !renewalDate) {
      return { success: false, message: 'Faltan datos obligatorios' };
    }

    const existing = await db.iaCredit.findUnique({ where: { userId } });
    if (existing) {
      return { success: false, message: 'El usuario ya tiene créditos asignados' };
    }

    const created = await db.iaCredit.create({
      data: {
        userId,
        total,
        used,
        renewalDate,
      },
    });

    return { success: true, message: 'Créditos creados correctamente', data: [created] };
  } catch (error) {
    console.error('[CREATE_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al crear créditos de IA' };
  }
}

// Recargar créditos
export async function rechargeIaCredit(
  userId: string,
  newTotal: number,
  newRenewalDate?: Date,
  used?: number
): Promise<IaCreditResponse> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    if (!userId) {
      return { success: false, message: 'Usuario desconocido.' };
    }

    const updated = await db.iaCredit.update({
      where: { userId },
      data: {
        total: newTotal,
        used,
        ...(newRenewalDate && { renewalDate: newRenewalDate }),
      },
    });

    return { success: true, message: 'Créditos recargados correctamente', data: [updated] };
  } catch (error) {
    console.error('[RECHARGE_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al recargar créditos de IA' };
  }
}
