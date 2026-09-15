import "server-only";

import { db } from "@/lib/db";
import { cupoDelPlanDeLaCuenta } from "@/lib/cupo-del-plan";

/**
 * Repone los créditos de una cuenta y deja su fecha igual que la del plan.
 *
 * ## Qué pasaba
 *
 * Nada renovaba los créditos **al pagar**. El motor tiene su propio reloj
 * (`renewDueCredits`, cada hora) que los repone cuando su `renewalDate` vence,
 * pero esa fecha iba por libre: no la movía el cobro, así que renovaba el mes
 * que tocara hubiera pago o no, y el cliente que acababa de pagar seguía con el
 * consumo del mes anterior encima. Desde fuera: **se paga y los créditos no
 * vuelven.**
 *
 * ## Lo que hace
 *
 * Tres cosas, y las tres en la misma escritura:
 *
 * - **`used = 0`**, que es reponer el consumo. Es lo que se pide.
 * - **`total` = el cupo del plan**, leído de Panel › Planes
 *   (`lib/cupo-del-plan.ts`). Así una subida de plan se nota en la primera
 *   renovación sin que nadie toque una fila a mano. El plan `personalizado` es
 *   la excepción a propósito: su total es un acuerdo, y se conserva.
 * - **`renewalDate` = la nueva fecha de vencimiento**, para que el reloj del
 *   motor no vuelva a reponerlos por su cuenta a mitad del ciclo.
 *
 * ## Nunca revienta, y nunca calla
 *
 * Quien la llama es el cobro, y **un fallo aquí no puede tumbar un pago**. Pero
 * **se dice**: unos créditos que no se reponen en silencio no se ven como un
 * error, se ven como «la IA dejó de contestar», que es muchísimo peor de
 * diagnosticar.
 *
 * Y lo normal también se anota, porque el número que se repone sale de una
 * cadena de cuatro fuentes y sin saber cuál contestó no hay forma de explicar un
 * cupo raro.
 *
 * Vive aquí y no dentro del fichero `'use server'` del cobro para poder
 * comprobarla contra una base de verdad sin levantar la App.
 */
export async function renovarLosCreditos(userId: string, fecha: Date): Promise<void> {
  try {
    const cupo = await cupoDelPlanDeLaCuenta(userId);

    // `updateMany` y no `update`: hay cuentas sin fila de créditos y un
    // `update` sobre lo que no existe revienta. Aquí no se crea ninguna: si
    // esta cuenta no tiene créditos, no hay nada que renovar.
    const repuestos = await db.iaCredit.updateMany({
      where: { userId },
      data: {
        used: 0,
        renewalDate: fecha,
        // El total solo se toca cuando hay un cupo que poner. En
        // `personalizado` viene `null` y la columna se queda como está.
        ...(typeof cupo?.creditos === "number" ? { total: cupo.creditos } : {}),
      },
    });

    if (repuestos.count > 0) {
      console.info("[billing] creditos renovados con el pago", {
        userId,
        plan: cupo?.plan ?? null,
        total: cupo?.creditos ?? "sin tocar",
        deDondeSalio: cupo?.deDondeSalio ?? "sin plan",
      });
    }
  } catch (error) {
    console.warn("[billing] no se pudieron renovar los creditos", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
