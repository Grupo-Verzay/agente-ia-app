/**
 * Las acciones que el banco de los menús de Registros necesita con FORMA.
 *
 * El resto las deja mudas `scripts/empaquetar-con-acciones-mudas.mjs`
 * (`{ success: true, data: [] }`); estas no pueden, porque quien las lee
 * espera otra cosa: la ficha de la cita pinta la cita que le devuelvan, y la
 * campanita lee `data.items`.
 */
export const getLatestAppointmentBySession = async () => ({
    success: true,
    data: {
        id: "cita-1",
        status: "PENDIENTE",
        serviceName: "Valoración",
        startTime: new Date("2026-09-24T15:00:00Z").toISOString(),
        endTime: new Date("2026-09-24T16:00:00Z").toISOString(),
    },
});
export const updateAppointmentStatus = async () => ({ success: true });
export const sendAppointmentStatusNotification = async () => ({ success: true });
export const getAppointmentsBySession = async () => ({ success: true, data: [] });

export const getNotificationCenterData = async () => ({
    success: true,
    data: { items: [], counts: {}, total: 0 },
});

// Las demás de esos dos ficheros, mudas: las importan componentes que cuelgan
// del diálogo y no deciden nada de lo que se mide.
const muda = async () => ({ success: true, data: [] });
export const createAppointment = muda;
export const deleteAppointment = muda;
export const getAppointmentStatusCounts = muda;
export const getAppointmentsByUser = muda;
export const getAppointmentsForKanban = muda;
export const getUserScheduleConfig = muda;
export const updateAppointmentDetails = muda;
