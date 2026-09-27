/**
 * La entrada que se empaqueta para el banco de la CALIDAD SEMANAL: el corte
 * semanal del reporte de VERDAD (`runWeeklyReportForAllUsers`), el runner de
 * calidad por el camino de verdad, y el escritor de mensajes de producción.
 * Se fingen solo la red: la IA (`openai`) y el envío de WhatsApp.
 */
export { runWeeklyReportForAllUsers, generateWeeklyReportForUser } from "@/lib/weekly-report-runner.server";
export { evaluarLaCalidadDeLaCuenta } from "@/lib/calidad-runner.server";
export { persistChatMessage } from "@/lib/chat-persistence";
export { db } from "@/lib/db";
export { enviados } from "./despachador-de-mentira";
export { pedidosALaIa } from "./openai-de-la-calidad";
