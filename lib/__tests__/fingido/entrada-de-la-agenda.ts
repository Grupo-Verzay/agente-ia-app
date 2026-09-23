/**
 * La entrada que se empaqueta para el banco de la Agenda de la familia.
 *
 * El `currentUser()` de mentira va DENTRO del paquete —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre— y, al lado,
 * **las acciones de verdad** del tablero de Agenda: leer las citas (calendario,
 * Kanban y conteos), cambiarles el estado y avisar al cliente.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { resolverLasCuentasDelCrm } from "@/lib/cuentas-del-crm";
export {
    getAppointmentsByUser,
    getAppointmentsForKanban,
    getAppointmentStatusCounts,
    updateAppointmentStatus,
    sendAppointmentStatusNotification,
} from "@/actions/appointments-actions";
export { db } from "@/lib/db";
