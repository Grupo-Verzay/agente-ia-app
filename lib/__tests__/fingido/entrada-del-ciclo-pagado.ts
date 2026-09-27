/**
 * La entrada del banco del ciclo pagado.
 *
 * Salen las CUATRO puertas por las que se paga, tal cual corren en producción:
 * «Marcar pagado» y «Editar pagos» de Instancias, «Aprobar» de Suscripciones y
 * la ruta que recibe el aviso de Wompi. Lo único que se finge es quién ha
 * iniciado sesión (`currentUser`), el almacén de Next (`revalidatePath`) y el
 * `cache()` de React.
 *
 * Y el trabajo diario (`syncUserBillingLifecycle`), para comprobar lo que de
 * verdad se reportó: que al día siguiente la cuenta NO se vuelve a suspender.
 */
export { ponerAQuienMira } from "./auth-de-documentos";

export { markUserAsPaid, setUserBillingDueDate } from "@/actions/billing/billing-actions";
export { approveSubscription } from "@/actions/user-subscription-actions";
export { POST as avisoDeWompi } from "@/app/api/payment/wompi/route";
export { syncUserBillingLifecycle } from "@/actions/billing/helpers/billing-notifications.server";

export { db } from "@/lib/db";
