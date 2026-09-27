/**
 * Qué significa «este ciclo está pagado». **Una sola regla, para los cuatro
 * caminos por los que se paga.**
 *
 * ## Qué pasaba
 *
 * Había cuatro formas de dar un ciclo por pagado y cada una hacía una parte:
 *
 * | camino | vencimiento | créditos | acceso |
 * | --- | --- | --- | --- |
 * | Wompi (`confirmPaymentInternal`) | lo mueve | los repone | lo reactiva |
 * | «Marcar pagado» de Instancias | **no lo movía** | **no** | lo reactiva |
 * | la fecha de «Editar pagos» | la escribe | **no** | según la fecha |
 * | «Aprobar» una suscripción | **no lo tocaba** | **los pisaba** | **no** |
 *
 * La primera fila de «Marcar pagado» es la que dolía: el cliente quedaba
 * «Pagado / Activo» con el vencimiento viejo, así que al día siguiente el
 * trabajo diario lo veía vencido y lo **volvía a suspender**. Desde fuera: se
 * cobra, se marca, y al día siguiente la cuenta está cortada otra vez.
 *
 * ## La regla
 *
 * Un ciclo pagado son las tres cosas a la vez, y las tres salen de aquí:
 *
 * 1. **El vencimiento avanza un ciclo** (`elSiguienteVencimiento`), con la
 *    MISMA cuenta que ya usaba Wompi: desde el vencimiento si todavía no ha
 *    pasado —pagar antes no regala ni quita días—, desde hoy si ya pasó.
 * 2. **Los créditos se reponen** (`lib/renovar-creditos.ts`), respetando el
 *    total pactado a mano de un plan `personalizado`.
 * 3. **El acceso vuelve**: pagado, activo, sin marca de suspensión y la cuenta
 *    habilitada si la había cortado la suspensión.
 *
 * Es puro a propósito: entra lo que hay y sale lo que toca, así que se prueba
 * sin levantar nada. Quien escribe es `lib/ciclo-pagado.server.ts`.
 */

/** Los días de un ciclo cuando la ficha no dice otra cosa. */
export const DIAS_DE_UN_CICLO = 30;

function comoFecha(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Los días de un ciclo: los de la ficha si son un entero positivo, si no 30. */
export function losDiasDelCiclo(licenseDays: number | null | undefined): number {
  const n = Number(licenseDays);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : DIAS_DE_UN_CICLO;
}

/**
 * Hasta cuándo queda pagado al pagar UN ciclo.
 *
 * - Vencimiento en el futuro → se suma el ciclo a ESE vencimiento: quien paga
 *   tres días antes no pierde esos tres días.
 * - Vencimiento pasado, o ninguno → se suma desde hoy: quien paga tarde no
 *   arrastra un ciclo que ya se le fue.
 */
export function elSiguienteVencimiento(
  actual: { dueDate?: Date | string | null; licenseDays?: number | null },
  ahora: Date = new Date(),
): Date {
  const vence = comoFecha(actual.dueDate);
  const base = vence && vence.getTime() > ahora.getTime() ? vence : new Date(ahora.getTime());
  const siguiente = new Date(base.getTime());
  siguiente.setDate(siguiente.getDate() + losDiasDelCiclo(actual.licenseDays));
  return siguiente;
}

/**
 * ¿Mover el vencimiento a esta fecha es renovar?
 *
 * «Editar pagos» deja escribir cualquier fecha, y no toda es un pago: corregir
 * un día para atrás o borrarla no puede regalar un mes de créditos. Se repone
 * **solo cuando la fecha avanza** —o cuando no había ninguna—, que es lo que
 * hace quien anota a mano que el cliente pagó.
 */
export function esUnaRenovacion(
  anterior: Date | string | null | undefined,
  nueva: Date | string | null | undefined,
): boolean {
  const n = comoFecha(nueva);
  if (!n) return false;
  const a = comoFecha(anterior);
  if (!a) return true;
  return n.getTime() > a.getTime();
}

/**
 * El plan con el que queda la cuenta al activar una suscripción.
 *
 * `personalizado` es un acuerdo hecho a mano —su total de créditos lo puso un
 * administrador— y cambiárselo por el de la suscripción era la mitad de cómo
 * «Aprobar» pisaba los créditos pactados: al dejar de ser `personalizado`, la
 * renovación siguiente ya le ponía el cupo de lista. Se conserva.
 */
export function elPlanQueQueda<P extends string>(actual: P | null | undefined, deLaSuscripcion: P): P {
  return actual === "personalizado" ? actual : deLaSuscripcion;
}

/**
 * ¿Hay que volver a habilitar la cuenta?
 *
 * Solo si la había cortado la suspensión: es lo mismo que hace el trabajo
 * diario al reactivar (`syncUserBillingLifecycle`). Una cuenta que un
 * administrador deshabilitó a mano estando al día no se habilita por pagar.
 */
export function vuelveLaCuenta(accesoAnterior: string | null | undefined): boolean {
  return accesoAnterior === "SUSPENDED";
}

/**
 * Las suscripciones que todavía esperan algo: el pago, o que alguien mire el
 * comprobante. **Las dos se pueden aprobar o rechazar.**
 *
 * Solo `PENDING_APPROVAL` tenía botones, y la pestaña por defecto solo
 * enseñaba esas. Así que una suscripción pagada por Wompi —que nace en
 * `PENDING_PAYMENT`— no la veía nadie ni se podía activar a mano: se quedaba
 * pendiente para siempre si el aviso de la pasarela no la reconocía.
 */
export const ESTADOS_PENDIENTES = ["PENDING_PAYMENT", "PENDING_APPROVAL"] as const;

export function estaPendiente(estado: string | null | undefined): boolean {
  return (ESTADOS_PENDIENTES as readonly string[]).includes(estado ?? "");
}
