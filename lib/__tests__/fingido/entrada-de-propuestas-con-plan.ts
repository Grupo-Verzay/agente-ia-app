/**
 * La entrada que se empaqueta para el banco de PROPUESTAS CON PLAN: una
 * plantilla enlazada a un plan del panel de Planes, lo que se carga al elegirla
 * en una propuesta y lo que la página pública de la propuesta enseña de ese
 * plan. Lo fingido es solo quién ha iniciado sesión y el despachador de
 * WhatsApp; las acciones, la puerta de la casa, las lecturas del panel de
 * Planes y las consultas son las de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    listarPropuestasAction,
    crearPropuestaAction,
    editarPropuestaAction,
    crearPlantillaAction,
    editarPlantillaAction,
    cargarPlanEnLaPropuestaAction,
} from "@/actions/propuestas-actions";
export { losPlanesDeLaPropuesta, elPlanParaCargar } from "@/lib/plan-de-la-propuesta.server";
export { laPropuestaPublica } from "@/lib/propuestas-db";
export { laFilaDelPlan } from "@/lib/plan-de-la-propuesta";
export { conLaFilaCargada } from "@/lib/plantillas-de-planes";
export { TOPE_DE_ALCANCE } from "@/lib/propuestas";
export { db } from "@/lib/db";
