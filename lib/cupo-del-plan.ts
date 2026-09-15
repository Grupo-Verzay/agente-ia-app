import "server-only";

import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Cuántos créditos le tocan a una cuenta por su plan.
 *
 * ## El cupo se LEE, no se escribe en código
 *
 * Es la condición del encargo, y no es un capricho: el cupo de cada plan lo
 * cambia Carlos en **Panel › Planes**, que es donde cada plan tiene además su
 * nombre comercial (Básico, Esencial, Business…). Un número escrito aquí sería
 * uno que nadie puede cambiar sin un despliegue, y que se contradice con lo que
 * la pantalla enseña.
 *
 * ## Por qué es una cadena y no una consulta
 *
 * Hay dos sitios donde vive un cupo por plan, y los dos son legítimos:
 *
 * 1. **`subscription_plans`**, que es lo que se edita en Panel › Planes. Ahí
 *    cada plan tiene nombre, precio y créditos. **Es el que manda.**
 * 2. **`plan_configs`**, la tabla vieja de «Créditos por plan». Sigue viva y el
 *    motor la lee en sus propias renovaciones, así que quitarla de en medio
 *    sería que la App y el motor repusieran cantidades distintas.
 *
 * Y detrás, el mismo respaldo escrito que ya tienen la App y el motor, **solo
 * para que una cuenta nunca se quede en cero por una tabla vacía**.
 *
 * Que sea una cadena y no un `if` suelto es lo que permite explicar el número:
 * `deDondeSalio` dice cuál de los cuatro contestó.
 */

/** El mismo respaldo que ya llevan `actions/actions-ia-credits.ts` y el motor. */
const RESPALDO: Record<Plan, number> = {
  lite: 1_000,
  basico: 3_000,
  intermedio: 5_000,
  avanzado: 8_000,
  enterprise: 10_000,
  personalizado: 0,
};

export type CupoDelPlan = {
  /** Créditos que le tocan. `null` = no se toca el total (plan personalizado). */
  creditos: number | null;
  plan: Plan;
  /** De dónde salió el número. Va a la consola: sin esto, un cupo raro no se puede explicar. */
  deDondeSalio: "suscripcion" | "planes" | "creditos-por-plan" | "respaldo" | "personalizado";
};

/**
 * El cupo de ESTA cuenta.
 *
 * `personalizado` devuelve `null` a propósito: ese plan es un acuerdo a mano y
 * su total lo pone un administrador. Reponerle un número calculado le borraría
 * el acuerdo en la primera renovación. Es el mismo trato que ya le da el motor.
 */
export async function cupoDelPlanDeLaCuenta(userId: string): Promise<CupoDelPlan | null> {
  const cuenta = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!cuenta) return null;

  const plan = cuenta.plan;
  if (plan === "personalizado") {
    return { creditos: null, plan, deDondeSalio: "personalizado" };
  }

  // 1. La suscripción que la cuenta tiene viva, si la hay. Es el plan que de
  //    verdad compró, con el nombre que se le puso en Panel › Planes.
  const suscripcion = await db.userSubscription
    .findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { subscriptionPlan: { select: { credits: true } } },
    })
    .catch(() => null);
  const deLaSuscripcion = suscripcion?.subscriptionPlan?.credits;
  if (typeof deLaSuscripcion === "number" && deLaSuscripcion > 0) {
    return { creditos: deLaSuscripcion, plan, deDondeSalio: "suscripcion" };
  }

  // 2. El plan de la cuenta en Panel › Planes. Sin suscripción viva —que es lo
  //    normal en los clientes que factura Carlos a mano— este es el número que
  //    la pantalla enseña.
  //
  //    `isResellerPlan: false`: los planes de reseller son otra lista, y su
  //    cupo es lo que un reseller le compra a Verzay, no lo que recibe un
  //    cliente. `order` primero porque es el orden con el que se pintan.
  const deLosPlanes = await db.subscriptionPlan
    .findFirst({
      where: { plan, isResellerPlan: false, isActive: true, credits: { gt: 0 } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { credits: true },
    })
    .catch(() => null);
  if (deLosPlanes?.credits) {
    return { creditos: deLosPlanes.credits, plan, deDondeSalio: "planes" };
  }

  // 3. La tabla vieja, que es la que lee el motor en sus renovaciones.
  const deCreditosPorPlan = await db.planConfig
    .findUnique({ where: { plan }, select: { credits: true } })
    .catch(() => null);
  if (deCreditosPorPlan?.credits) {
    return { creditos: deCreditosPorPlan.credits, plan, deDondeSalio: "creditos-por-plan" };
  }

  // 4. El respaldo escrito. Que una cuenta se quede sin créditos porque nadie
  //    configuró su plan es peor que darle el número de siempre.
  return { creditos: RESPALDO[plan] ?? 0, plan, deDondeSalio: "respaldo" };
}
