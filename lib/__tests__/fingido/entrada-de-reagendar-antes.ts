/**
 * El «antes» de reagendar: las acciones de citas tal como estaban en
 * `ANTES_REF`, sacadas de git a una carpeta aparte (ver el script). No había
 * `reagendarCitaAction`; lo único que movía una cita en el tiempo era
 * `updateAppointmentDetails`, y el modo roto afirma que dejaba vivos los
 * recordatorios de la hora vieja.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export * as antes from "../.antes/reagendar/actions/appointments-actions";
export { db } from "@/lib/db";
