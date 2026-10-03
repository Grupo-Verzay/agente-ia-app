// Cuántos productos caben en el catálogo de cada plan.
//
// Es pura y vive aparte a propósito: la usan la acción que crea productos
// (`actions/products-actions.ts`) y la página pública de un plan, que enseña
// ese mismo número en su «Resumen de capacidad». Con el número escrito en dos
// sitios, la página prometería un catálogo que la acción después no deja
// llenar.
import type { Plan } from "@prisma/client";

/** `null` = sin límite fijo: depende del `productLimit` que ponga el admin. */
export const PRODUCTOS_POR_PLAN: Record<Plan, number | null> = {
  lite: 0,
  basico: 10,
  intermedio: 25,
  avanzado: 50,
  enterprise: 100,
  personalizado: null,
};

/** El tope de productos de un plan. Un plan que no se conoce no incluye catálogo. */
export function elTopeDeProductos(plan: string | null | undefined): number | null {
  if (!plan) return 0;
  const tope = (PRODUCTOS_POR_PLAN as Record<string, number | null | undefined>)[plan];
  return tope === undefined ? 0 : tope;
}
