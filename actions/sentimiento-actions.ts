'use server';

import { currentUser } from '@/lib/auth';
import { lasCuentasQueConsultaElCrm } from '@/lib/cuentas-del-crm';
import { elDiaDe, lasCaidas } from '@/lib/sentimiento-db';
import { armarElReporte, losDiasDelPeriodo, type ReporteDeSentimiento } from '@/lib/sentimiento';

/**
 * El reporte de sentimiento del CRM: cuántas conversaciones CAYERON a negativo,
 * por día y por asesor.
 *
 * Las cuentas pasan por `lasCuentasQueConsultaElCrm`, la misma puerta que el
 * resto de Analíticas: una acción ES un endpoint y la lista llega del
 * navegador. Hacia abajo, nunca hacia arriba.
 */
export async function getSentimientoCrmData(params?: {
  days?: number;
  cuentas?: readonly string[] | null;
}): Promise<ReporteDeSentimiento> {
  const dias = Math.max(1, Math.min(366, Math.floor(params?.days ?? 30)));
  const hoy = elDiaDe(new Date());
  const vacio = armarElReporte([], hoy, dias);
  const me = await currentUser();
  if (!me?.effectiveId) return vacio;
  const cuentas = await lasCuentasQueConsultaElCrm(me.effectiveId, params?.cuentas);
  try {
    const desde = losDiasDelPeriodo(hoy, dias)[0];
    return armarElReporte(await lasCaidas(cuentas, desde), hoy, dias);
  } catch (error) {
    console.warn('[sentimiento] no se pudo leer el reporte', (error as Error)?.message);
    return vacio;
  }
}
