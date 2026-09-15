/**
 * Cuándo renueva una cuenta. **Una sola fecha, no dos.**
 *
 * ## Qué pasaba
 *
 * En Perfil › Cuenta convivían dos fechas para lo mismo: «Vencimiento» del plan
 * (`UserBilling.dueDate`) y «Renovación» de los créditos
 * (`IaCredit.renewalDate`). En una cuenta salían **27 de septiembre** y
 * **14 de octubre**, una al lado de la otra.
 *
 * No era un desajuste puntual: son dos columnas para un mismo concepto,
 * escritas por seis sitios distintos con tres criterios distintos.
 *
 * | quién crea la cuenta | `dueDate` | `renewalDate` |
 * | --- | --- | --- |
 * | el registro | fin de la prueba | fin de la prueba — **iguales** |
 * | un admin, con pool de licencias | lo pone la ficha de facturación | hoy + 1 mes |
 * | un reseller (tres caminos) | aparte | hoy + 1 mes |
 * | aprobar una suscripción | aparte | el `expiresAt` de la suscripción |
 *
 * Y sobre todo: **al pagar, el plan avanza y los créditos no**.
 * `setUserBillingDueDateInternal` mueve `dueDate` y `serviceEndsAt`, y nunca
 * tocaba `renewalDate`. Así que incluso las cuentas que nacían alineadas —las
 * del registro— se separaban en la primera renovación, y cada pago ensanchaba
 * la diferencia.
 *
 * ## La regla
 *
 * **Los créditos renuevan cuando renueva el plan**, así que la fecha que manda
 * es la del plan. No se mantienen dos columnas sincronizadas —eso es pedirle a
 * seis sitios que se acuerden, y es como se llegó aquí—: **se lee una sola**.
 *
 * `IaCredit.renewalDate` se sigue escribiendo, y se sigue moviendo con el pago,
 * para que no mienta a nadie más que la lea; pero quien decide qué se enseña es
 * esta función.
 *
 * Es puro a propósito: entran dos fechas y sale una. Así se puede comprobar sin
 * levantar nada, que es la única forma de demostrar que las dos pantallas dicen
 * lo mismo.
 */

/**
 * La fecha de renovación que manda.
 *
 * @param delPlan   `UserBilling.dueDate`. Es la que manda cuando existe.
 * @param guardada  `IaCredit.renewalDate`. Solo vale como respaldo.
 *
 * El respaldo NO es un detalle: hay cuentas sin ficha de facturación —creadas
 * por un reseller, o antiguas— y sin él esa gente vería un hueco donde antes
 * había una fecha. Enseñar la guardada es peor que enseñar la del plan, pero
 * mucho mejor que no enseñar nada.
 */
export function laFechaQueRenueva(
  delPlan: Date | string | null | undefined,
  guardada: Date | string | null | undefined,
): Date | null {
  return comoFecha(delPlan) ?? comoFecha(guardada);
}

/** Una fecha de verdad, o nada. Un `Invalid Date` cuenta como nada. */
function comoFecha(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
