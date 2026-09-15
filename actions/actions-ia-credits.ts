'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { puedeGestionarAlCliente } from '@/lib/gestion-de-clientes';
import { laFechaQueRenueva } from '@/lib/fecha-de-renovacion';
import { isAdminLike } from '@/lib/rbac';
import { IaCredit, Plan } from '@prisma/client';
import { randomUUID } from 'crypto';

interface IaCreditResponse {
  success: boolean;
  message: string;
  data?: IaCredit[];
  /**
   * `false` solo cuando la respuesta es un «no autorizado».
   *
   * Sin distinguirlo, un «no puedo leerlos» y un «esta cuenta todavía no tiene
   * créditos» llegan a la pantalla igual —los dos con `success: false`— y el
   * formulario pinta 0 en los dos casos. En el primero, guardar escribiría ese
   * 0 encima del tope real.
   */
  autorizado?: boolean;
}

export interface PlanConfigItem {
  plan: Plan;
  credits: number;
}

const PLAN_CREDIT_DEFAULTS: Record<Plan, number> = {
  lite: 1_000,
  basico: 3_000,
  intermedio: 5_000,
  avanzado: 8_000,
  enterprise: 10_000,
  personalizado: 0,
};

// ── Plan Config ───────────────────────────────────────────────────

export async function getAllPlanConfigs(): Promise<{
  success: boolean;
  message: string;
  data?: PlanConfigItem[];
}> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    const configs = await db.planConfig.findMany();

    const data: PlanConfigItem[] = (Object.keys(PLAN_CREDIT_DEFAULTS) as Plan[]).map((plan) => {
      const existing = configs.find((c) => c.plan === plan);
      return { plan, credits: existing?.credits ?? PLAN_CREDIT_DEFAULTS[plan] };
    });

    return { success: true, message: 'OK', data };
  } catch (error) {
    console.error('[GET_PLAN_CONFIGS_ERROR]', error);
    return { success: false, message: 'Error al obtener configuración de planes' };
  }
}

export async function updatePlanConfigAction(
  plan: Plan,
  credits: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    await db.planConfig.upsert({
      where: { plan },
      create: { id: randomUUID(), plan, credits },
      update: { credits },
    });

    return { success: true, message: `Plan ${plan} actualizado a ${credits} créditos` };
  } catch (error) {
    console.error('[UPDATE_PLAN_CONFIG_ERROR]', error);
    return { success: false, message: 'Error al actualizar configuración del plan' };
  }
}

/** Returns the credits configured for a given plan (falls back to defaults). */
export async function getPlanCredits(plan: Plan): Promise<number> {
  try {
    const config = await db.planConfig.findUnique({ where: { plan } });
    return config?.credits ?? PLAN_CREDIT_DEFAULTS[plan] ?? 0;
  } catch {
    return PLAN_CREDIT_DEFAULTS[plan] ?? 0;
  }
}

// ── Own Credits (para el usuario autenticado) ────────────────────

export async function getOwnIaCredits(): Promise<{
  success: boolean;
  message: string;
  data?: { total: number; used: number; available: number; renewalDate: Date | null };
}> {
  try {
    const me = await currentUser();
    if (!me?.id) return { success: false, message: 'No autenticado' };

    const record = await db.iaCredit.findUnique({ where: { userId: me.id } });
    if (!record) return { success: false, message: 'Sin créditos configurados' };

    const usedCredits = Math.floor(record.used / 3085);
    const available = Math.max(0, record.total - usedCredits);

    // La fecha que manda es la del PLAN, no la guardada en los créditos.
    //
    // En la misma pantalla convivían «Vencimiento 27 de septiembre» y
    // «Renovación 14 de octubre»: dos columnas para un mismo concepto,
    // escritas por seis sitios con tres criterios distintos, y el pago movía
    // una sola. Ver `lib/fecha-de-renovacion.ts`.
    const facturacion = await db.userBilling.findUnique({
      where: { userId: me.id },
      select: { dueDate: true },
    });
    const renewalDate = laFechaQueRenueva(facturacion?.dueDate, record.renewalDate);

    return {
      success: true,
      message: 'OK',
      data: { total: record.total, used: usedCredits, available, renewalDate },
    };
  } catch (error) {
    console.error('[GET_OWN_CREDITS_ERROR]', error);
    return { success: false, message: 'Error al obtener créditos' };
  }
}

// ── Per-user Credits ──────────────────────────────────────────────

export async function getIaCreditByUser(userId: string): Promise<IaCreditResponse> {
  try {
    // Mismo criterio que para escribirlos: si un reseller puede poner el tope de
    // sus clientes, tiene que poder leerlo. Sin esto vería 0 y al guardar
    // machacaría el valor real con ceros.
    if (!(await puedeVerLosCreditos(userId))) {
      return { success: false, message: 'No autorizado', autorizado: false };
    }

    if (!userId) {
      return { success: false, message: 'userId es requerido' };
    }

    const record = await db.iaCredit.findUnique({ where: { userId } });

    if (!record) {
      return { success: false, message: 'No se encontraron créditos para este usuario' };
    }

    return { success: true, message: 'Créditos encontrados', data: [record] };
  } catch (error) {
    console.error('[GET_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al obtener créditos de IA' };
  }
}

/**
 * ¿Puede esta persona tocar los créditos de esta cuenta?
 *
 * **La misma puerta que Editar, Módulos, Asignar y Eliminar**
 * (`puedeGestionarAlCliente`), y no una lista propia. La de aquí pedía
 * `isAdminLike(me.role)` —el rol de la PERSONA— y eso dejaba fuera al
 * `administrador` de una cuenta, que no tiene ese rol ni lo va a tener: lo que
 * tiene es la cuenta. Desde fuera se veía así: abría «Editar cliente», los
 * créditos salían en 0, los escribía, guardaba, y al volver a abrir seguían en
 * 0. Ni un aviso, porque el fallo del guardado solo iba a la consola.
 *
 * Es el mismo fallo que ya costó Clientes, Equipo y Analíticas, y la misma
 * regla del documento: **el administrador de una cuenta actúa POR la cuenta**,
 * y se pregunta por el cliente, no solo por quién llama. Un `agente` sigue sin
 * pasar, y un reseller solo sobre los suyos.
 */
async function puedeGestionarCreditos(userId: string): Promise<boolean> {
  const me = await currentUser();
  if (!me) return false;
  return puedeGestionarAlCliente(me, userId);
}

/**
 * ¿Puede VERLOS?
 *
 * Lo mismo, más uno mismo. Mirar el propio saldo no es gestionar nada, y con la
 * regla de escribir aplicada a la lectura, el contador de créditos de una
 * cuenta corriente se quedaba sin datos.
 */
async function puedeVerLosCreditos(userId: string): Promise<boolean> {
  const me = await currentUser();
  if (!me) return false;
  if (me.id === userId) return true;
  return puedeGestionarAlCliente(me, userId);
}

export async function createIaCreditForUser(
  userId: string,
  total: number,
  renewalDate: Date,
  used?: number,
): Promise<IaCreditResponse> {
  try {
    if (!(await puedeGestionarCreditos(userId))) {
      return { success: false, message: 'No autorizado', autorizado: false };
    }

    if (!userId || total == null || !renewalDate) {
      return { success: false, message: 'Faltan datos obligatorios' };
    }

    const existing = await db.iaCredit.findUnique({ where: { userId } });
    if (existing) {
      return { success: false, message: 'El usuario ya tiene créditos asignados' };
    }

    const created = await db.iaCredit.create({
      data: { userId, total, used, renewalDate },
    });

    return { success: true, message: 'Créditos creados correctamente', data: [created] };
  } catch (error) {
    console.error('[CREATE_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al crear créditos de IA' };
  }
}

export async function rechargeIaCredit(
  userId: string,
  newTotal: number,
  newRenewalDate?: Date,
  used?: number,
): Promise<IaCreditResponse> {
  try {
    if (!(await puedeGestionarCreditos(userId))) {
      return { success: false, message: 'No autorizado', autorizado: false };
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
