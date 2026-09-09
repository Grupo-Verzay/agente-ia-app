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
 */
export type EstadoDelServicio = "todos" | "activos" | "inactivos";

export function tieneServicioActivo(cliente: ClientInterface): boolean {
  return cliente.billing?.accessStatus === "ACTIVE";
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
  todos: "Todos los clientes",
  activos: "Con servicio activo",
  inactivos: "Sin servicio activo",
};
