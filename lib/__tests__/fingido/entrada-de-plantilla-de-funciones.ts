/**
 * La entrada que se empaqueta para el banco de la PLANTILLA MAESTRA DE
 * FUNCIONES. Lo fingido es solo quién ha iniciado sesión (y lo que pide una
 * petición de Next) y el bucket; las acciones del panel de Planes, la
 * sincronización de la plantilla, las tablas `plan_funciones` y
 * `plan_funciones_maestras`, lo que arma la página pública y lo que lee la
 * landing son los de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    upsertSubscriptionPlan,
    getAllSubscriptionPlans,
    getActiveSubscriptionPlans,
    guardarLaPlantillaDeFunciones,
} from "@/actions/subscription-plan-actions";
export { laPaginaDelPlan } from "@/lib/pagina-de-plan.server";
export { lasFuncionesGuardadas, guardarLasFunciones, asegurarLaTablaDeFunciones } from "@/lib/plan-funciones-db";
export * as plantilla from "@/lib/plantilla-de-funciones";
export { db } from "@/lib/db";
export { LA_PLANTILLA_CAMBIO } from "@/lib/plantilla-de-funciones-db";
