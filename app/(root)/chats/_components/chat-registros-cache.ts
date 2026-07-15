// Caché + cargador COMPARTIDO de los "registros del lead" (registros, seguimientos,
// recordatorios, citas, follow-ups CRM y síntesis). Lo usan el badge del header (para
// el contador) y el sheet "Registros" (para el detalle). Antes cada uno consultaba por
// su lado (5–6 queries duplicadas) y el sheet mostraba skeleton en cada lead nuevo.
//
// Ahora: una sola carga por sesión (dedup de llamadas en vuelo). El badge la dispara al
// abrir el chat, así que cuando el usuario abre el sheet ya está cacheada → instantáneo.

import { getRegistrosBySessionId } from "@/actions/registro-action";
import { getSessionLegacySeguimientos } from "@/actions/seguimientos-actions";
import {
  getSessionCrmFollowUps,
  getSessionLatestSummarySnapshot,
} from "@/actions/crm-follow-up-actions";
import { getRemindersByRemoteJid } from "@/actions/reminders-actions";
import { getAppointmentsBySession } from "@/actions/appointments-actions";
import type { Registro } from "@prisma/client";

export type RegistrosSnapshot = {
  registros: Registro[];
  seguimientosPendingCount: number; // legacy (getSessionLegacySeguimientos)
  seguimientosPendientes: number; // CRM follow-ups (getSessionCrmFollowUps)
  recordatoriosCount: number;
  citasCount: number;
  sintesis: string | null;
  followUpId: string | null;
  hasFollowUp: boolean;
};

const cache = new Map<number, RegistrosSnapshot>();
const inflight = new Map<number, Promise<RegistrosSnapshot>>();

export function getCachedRegistrosSnapshot(sessionId: number): RegistrosSnapshot | undefined {
  return cache.get(sessionId);
}

export function invalidateRegistrosSnapshot(sessionId: number): void {
  cache.delete(sessionId);
  inflight.delete(sessionId);
}

export function loadRegistrosSnapshot(
  sessionId: number,
  userId: string,
  remoteJid: string,
  opts?: { force?: boolean },
): Promise<RegistrosSnapshot> {
  if (!opts?.force) {
    const existing = inflight.get(sessionId);
    if (existing) return existing;
  }
  const promise = (async () => {
    const [regResult, legacyResult, crmResult, remResult, apptResult, synResult] = await Promise.all([
      getRegistrosBySessionId(sessionId),
      getSessionLegacySeguimientos(remoteJid),
      getSessionCrmFollowUps(sessionId, userId),
      getRemindersByRemoteJid(userId, remoteJid),
      getAppointmentsBySession(sessionId),
      getSessionLatestSummarySnapshot(sessionId),
    ]);
    // Si alguna consulta falla, se conserva el último valor cacheado (no borrar por un
    // error transitorio durante un refresco).
    const prev = cache.get(sessionId);
    const legacyData = (legacyResult.success ? legacyResult.data : null) as
      | Array<{ followUpStatus?: string }>
      | null;
    const crmData = (crmResult.success ? crmResult.data : null) as
      | Array<{ status?: string }>
      | null;
    const apptData = (apptResult.success ? apptResult.data : null) as
      | Array<{ status?: string }>
      | null;
    const syn = (synResult.success ? synResult.data : null) as
      | { summarySnapshot?: string | null; id?: string | null }
      | null;
    const snapshot: RegistrosSnapshot = {
      registros: regResult.success && regResult.data ? regResult.data : prev?.registros ?? [],
      seguimientosPendingCount: legacyData
        ? legacyData.filter((i) => i.followUpStatus === "pending").length
        : prev?.seguimientosPendingCount ?? 0,
      seguimientosPendientes: crmData
        ? crmData.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length
        : prev?.seguimientosPendientes ?? 0,
      recordatoriosCount:
        remResult.success && remResult.data ? remResult.data.length : prev?.recordatoriosCount ?? 0,
      citasCount: apptData
        ? apptData.filter((a) => !["FINALIZADO", "DESCARTADO", "CANCELADA"].includes(a.status ?? "")).length
        : prev?.citasCount ?? 0,
      sintesis: syn ? syn.summarySnapshot ?? null : prev?.sintesis ?? null,
      followUpId: syn ? syn.id ?? null : prev?.followUpId ?? null,
      hasFollowUp: syn ? true : prev?.hasFollowUp ?? false,
    };
    cache.set(sessionId, snapshot);
    return snapshot;
  })();
  inflight.set(sessionId, promise);
  void promise.finally(() => {
    if (inflight.get(sessionId) === promise) inflight.delete(sessionId);
  });
  return promise;
}
