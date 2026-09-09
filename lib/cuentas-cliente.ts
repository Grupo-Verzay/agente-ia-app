import { db } from "@/lib/db";
import { isAdminLike } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export type CuentaCliente = {
  id: string;
  name: string | null;
  email: string;
  company: string;
};

/**
 * Las cuentas de cliente sobre las que manda esta cuenta. Un admin las tiene
 * todas; un reseller, las suyas —las que creó como demo y las que le asignaron—.
 *
 * Vive aquí y no junto a unas acciones concretas porque la usan dos cosas que no
 * se parecen en nada: repartir clientes entre el equipo, y elegir a qué cuentas
 * se les enseña un diagrama. Es la misma pregunta, y conviene que tenga una sola
 * respuesta.
 */
export async function clientesDeLaCuenta(owner: {
  id: string;
  role: string;
}): Promise<CuentaCliente[]> {
  // Cuentas PRINCIPALES, no gente del equipo de otra cuenta.
  //
  // El rol no basta para distinguirlas: un asesor se crea con rol `user` igual
  // que un cliente, y lo que lo diferencia es que cuelga de alguien
  // (`ownerId`). Sin esta condicion, la lista de "Clientes asignados" salia
  // mezclada con los asesores de otras cuentas -61 filas donde deberian ser
  // muchas menos-, y ninguno de ellos es una cuenta a la que se pueda entrar a
  // administrar: no tienen nada que administrar, son personas dentro de otra.
  const base = {
    role: { in: ["user", "affiliate"] as Role[] },
    ownerId: null,
  };
  const select = { id: true, name: true, email: true, company: true };

  if (isAdminLike(owner.role)) {
    return db.user.findMany({ where: base, select, orderBy: { company: "asc" } });
  }

  const asignados = await db.reseller.findMany({
    where: { resellerid: owner.id },
    select: { userId: true },
  });
  const idsAsignados = asignados
    .map((a) => a.userId)
    .filter((id): id is string => !!id);

  return db.user.findMany({
    where: {
      ...base,
      OR: [{ demoResellerId: owner.id }, { id: { in: idsAsignados } }],
    },
    select,
    orderBy: { company: "asc" },
  });
}
