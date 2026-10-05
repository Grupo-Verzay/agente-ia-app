/**
 * ¿Qué fecha de renovación se guarda al EDITAR los créditos de una cuenta a mano?
 *
 * Las cuatro pantallas que editan créditos (Clientes y Créditos, del panel y
 * del admin) mandaban `new Date()` como fecha de renovación. Con la fecha en
 * «ahora», el reloj del motor (`renewDueCredits`, cada hora) la veía vencida y
 * reponía el cupo del plan en la hora siguiente: dejar una cuenta en cero a
 * mano duraba como mucho una hora, y la cuenta seguía consumiendo.
 *
 * La regla: **editar los créditos no adelanta la renovación.** Una fecha que no
 * está en el futuro no se escribe: se conserva la guardada si sigue en el
 * futuro, y si no hay ninguna que sirva, dentro de un mes.
 *
 * Pura: el banco la prueba sin base.
 */

function dentroDeUnMes(ahora: Date): Date {
  const d = new Date(ahora.getTime());
  d.setMonth(d.getMonth() + 1);
  return d;
}

const enElFuturo = (d: Date | null | undefined, ahora: Date): d is Date =>
  d instanceof Date && !Number.isNaN(d.getTime()) && d.getTime() > ahora.getTime();

export function laFechaAlEditar(
  pedida: Date | null | undefined,
  guardada: Date | null | undefined,
  ahora: Date = new Date(),
): Date {
  if (enElFuturo(pedida, ahora)) return pedida;
  if (enElFuturo(guardada, ahora)) return guardada;
  return dentroDeUnMes(ahora);
}
