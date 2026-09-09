import type { ClientInterface } from "@/lib/types/user";

/**
 * Cuándo un cliente cuenta como ACTIVO.
 *
 * La lista decía «35 clientes» contando suspendidos, morosos y cuentas que
 * quedaron ahí. Activo es que el servicio esté al día, que es el mismo estado
 * que mandan Finanzas y Analíticas —`UserBilling.accessStatus`—, para que los
 * tres sitios digan el mismo número.
 *
 * Sin fila de facturación no se da por activo: es una cuenta a la que nunca se
 * le configuró el servicio, y contarla es justo lo que inflaba el total.
 *
 * Y la cuenta tiene que estar habilitada. El «muñequito» de la columna Estado
 * es `User.status`: una cuenta deshabilitada no entra a la App por mucho que su
 * facturación siga diciendo ACTIVE, así que no es un cliente activo. Contar
 * solo la facturación es lo que dejaba filas con el muñequito en rojo dentro
 * del filtro de activos.
 */
export type EstadoDelServicio = "todos" | "activos" | "inactivos";

export function tieneServicioActivo(cliente: ClientInterface): boolean {
  return cliente.status === true && cliente.billing?.accessStatus === "ACTIVE";
}

export function cumpleEstadoDelServicio(
  cliente: ClientInterface,
  estado: EstadoDelServicio,
): boolean {
  if (estado === "todos") return true;
  const activo = tieneServicioActivo(cliente);
  return estado === "activos" ? activo : !activo;
}

export const ETIQUETAS_DE_SERVICIO: Record<EstadoDelServicio, string> = {
  todos: "Todos",
  activos: "Activos",
  inactivos: "Inactivos",
};
