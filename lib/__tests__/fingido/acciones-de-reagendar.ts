/**
 * Las acciones de citas, fingidas para el banco de navegador de «Reagendar».
 * Se anota qué se pidió y con qué, y se contesta como contestaría el servidor.
 */
const w = globalThis as unknown as Record<string, any>;

const INICIO = "2026-10-05T15:00:00.000Z";
const FIN = "2026-10-05T16:30:00.000Z";

export type SessionAppointmentCard = { id: string; status: string; startTime: string; endTime: string; serviceName: string | null };

export async function getLatestAppointmentBySession() {
    return { success: true, data: { id: "cita-1", status: "NO_ASISTIDA", startTime: INICIO, endTime: FIN, serviceName: "Consulta" } };
}
export async function updateAppointmentStatus(id: string, status: string) {
    (w.__estados ??= []).push({ id, status });
    return { success: true, message: "ok" };
}
export async function sendAppointmentStatusNotification() {
    return { success: true, message: "ok" };
}
export async function datosParaReagendarAction(id: string) {
    (w.__datosPedidos ??= []).push(id);
    return {
        success: true,
        data: { cuentaId: "cuenta-duena", zona: "America/Bogota", duracionMinutos: 90, inicio: INICIO, fin: FIN, cliente: "Ana Pérez", estado: "NO_ASISTIDA" },
    };
}
export async function reagendarCitaAction(id: string, startTime: string, endTime: string) {
    (w.__reagendadas ??= []).push({ id, startTime, endTime });
    return {
        success: true,
        message: "Cita reagendada. 2 recordatorio(s) programado(s).",
        data: { id, startTime: new Date(startTime), endTime: new Date(endTime), status: "PENDIENTE" },
        recordatorios: { borrados: 2, creados: 2 },
    };
}
