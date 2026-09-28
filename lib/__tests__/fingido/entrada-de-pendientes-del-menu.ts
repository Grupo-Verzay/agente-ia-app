// Las acciones de VERDAD del contador del menú y de las pastillas de sus
// pantallas, con solo `currentUser()` fingido: así se comparan los dos números.
export { pendientesDelMenuAction } from "@/actions/pendientes-del-menu-actions";
export { getAppointmentStatusCounts } from "@/actions/appointments-actions";
export { getBookingStatusCounts } from "@/actions/bookings-actions";
export { resolverLasCuentasDelCrm } from "@/lib/cuentas-del-crm";
export { cuantosRecordatoriosPendientes, seVeEnLaListaDeRecordatorios, lasPendientesDelConteo } from "@/lib/pendientes-del-menu";
export { ponerAQuienMira } from "./auth-de-documentos";
export { db } from "@/lib/db";
