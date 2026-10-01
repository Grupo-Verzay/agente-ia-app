/**
 * La entrada del banco del nivel de la licencia.
 *
 * Salen las PUERTAS que guardan el nivel de una cuenta que puede ser cliente de
 * un reseller, tal cual corren en producción: editar la ficha en Clientes,
 * crear un cliente (las dos formas), elegir plan para pagar desde el Perfil y
 * aprobar una suscripción. Lo único que se finge es quién ha iniciado sesión
 * (`currentUser`), el almacén de Next (`revalidatePath`) y el `cache()` de React.
 *
 * Solo exporta lo que existe en los DOS árboles —el de ahora y el de antes—:
 * la misma entrada se empaqueta contra los dos.
 */
export { ponerAQuienMira } from "./auth-de-documentos";

export { updateClientData, createUserWithPausar } from "@/actions/userClientDataActions";
export { createClientAccount } from "@/actions/reseller-license-actions";
export { elegirPlanParaPagar } from "@/actions/billing/choose-plan-actions";
export { activarLaSuscripcion } from "@/lib/suscripcion-activa.server";

export { db } from "@/lib/db";
