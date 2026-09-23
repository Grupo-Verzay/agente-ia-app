/**
 * La entrada que se empaqueta para el banco del CRM de la familia.
 *
 * Sale por aquí lo mismo que en los demás bancos de acciones: el
 * `currentUser()` de mentira **dentro del paquete** —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre— y, al lado,
 * **las acciones de verdad** de las cinco pestañas del CRM.
 *
 * Lo que este banco viene a demostrar no es que `laSeleccionDelCrm` sepa
 * filtrar una lista —eso lo prueba el banco puro de al lado— sino que **las
 * consultas pasan por ella**: que la madre ve lo de sus hijas, que una hija no
 * ve nada de su madre ni de su hermana por mucho que escriba el parámetro a
 * mano, y que los totales cuadran con lo que el filtro tenga puesto. Eso solo
 * se ve contra Postgres, con `linked_accounts` sembrada antes.
 */
export { ponerAQuienMira } from "./auth-de-documentos";

/* Lo que alcanza cada quien, que es la puerta por la que pasan las cinco. */
export { resolverLasCuentasDelCrm, lasCuentasQueConsultaElCrm } from "@/lib/cuentas-del-crm";

/* Registros: la lista y sus contadores. */
export { getRegistrosByUserId, getCrmDashboardStatsByUserId } from "@/actions/registro-action";

/* Llamadas. */
export { getCallsCrmData, setCallDisposition } from "@/actions/calls-crm-actions";

/* Kanban. */
export { getKanbanSessionsAction } from "@/actions/crm-kanban-actions";

/* Reportes: el informe semanal y lo que la IA no supo, con sus totales. */
export { getWeeklyReports } from "@/actions/weekly-report-actions";
export { getInformeSinRespuesta } from "@/actions/informe-sin-respuesta-actions";

/* Analíticas. */
export { getAnalyticsDataByUserId } from "@/actions/analytics-action";

export { db } from "@/lib/db";
