/**
 * Entrada del banco del Modo Dueño (Fase 0). Las rutas `/api/owner/*` de
 * verdad, el motor y las acciones del panel: lo único que se finge es la
 * petición (sesión y cookies) para la acción de restaurar del editor.
 */
export { ponerLaSesion } from "./sesion-y-cookies";
export { POST as tarea } from "@/app/api/owner/task/route";
export { POST as recordatorio } from "@/app/api/owner/reminder/route";
export { POST as mensaje } from "@/app/api/owner/message/route";
export { POST as estadoDelLead } from "@/app/api/owner/lead-status/route";
export { POST as etiqueta } from "@/app/api/owner/tag/route";
export { POST as asesor } from "@/app/api/owner/assign/route";
export { POST as instruccion } from "@/app/api/owner/training/instruction/route";
export { POST as restaurarEntrenamiento } from "@/app/api/owner/training/restore/route";
export { POST as resumen } from "@/app/api/owner/summary/route";
export { POST as citas } from "@/app/api/owner/appointments/route";
export { POST as turno } from "@/app/api/owner/turn/route";
export { POST as deshacer } from "@/app/api/owner/revert/route";
export { POST as historial } from "@/app/api/owner/history/route";
export { POST as lidConCodigo } from "@/app/api/owner/identity/lid/route";
export { generarCodigoDeVerificacion } from "@/lib/identidad-del-dueno.server";
export { restoreRevision } from "@/actions/system-prompt-actions";
export { generarCodigoDelDueno } from "@/actions/owner-mode-actions";
export { phonesMatch } from "@/lib/owner-command-auth";
export { db } from "@/lib/db";
