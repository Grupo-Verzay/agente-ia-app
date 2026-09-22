"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin, isAdminOrReseller } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { cuelgaHaciaAbajo } from "@/lib/alcance-entre-cuentas";
import {
  juzgarElAlcance,
  losEnlacesDeLaCuenta,
} from "@/lib/alcance-entre-cuentas.server";
import { buildBillingServiceAccessState } from "./service-access";
import { facturacionQueMandaEn } from "./billing-owner";

export async function assertCanAccessTargetUser(targetUserId: string) {
  const actor = await currentUser();
  if (!actor) throw new Error("No autorizado.");

  const cleanTarget = String(targetUserId ?? "").trim();
  if (!cleanTarget) throw new Error("userId es requerido.");

  if (actor.id === cleanTarget) return actor;

  // Asesores pueden acceder a datos de su dueño
  if (actor.ownerId === cleanTarget) return actor;

  // El superadministrador de verdad llega a todo, porque todo cuelga de él.
  // Va aquí delante y no en la rama de rol: las reglas de abajo ya no dejan
  // pasar hacia arriba, y él es la única excepción. Dentro de un cliente por
  // «Ingresar» esto es falso a propósito —se entra a ver lo que ve el cliente—.
  if (esSuperAdminDeVerdad(actor)) return actor;

  const effectiveActorId = actor.ownerId ?? actor.id;

  // Cuentas vinculadas: SOLO HACIA ABAJO. Se llega a una cuenta que uno vinculó
  // bajo la suya, y a lo que cuelga de ella; nunca a la que le vinculó a uno.
  // Antes la consulta miraba las dos direcciones, así que una cuenta hija
  // actuaba sobre los datos de su madre con solo nombrar su id.
  try {
    const link = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "linked_accounts"
      WHERE "master_user_id" = ${effectiveActorId} AND "linked_user_id" = ${cleanTarget}
      LIMIT 1
    `;
    if (link.length > 0) return actor;
    if (cuelgaHaciaAbajo(effectiveActorId, cleanTarget, await losEnlacesDeLaCuenta(effectiveActorId))) {
      return actor;
    }
  } catch {
    // Si la tabla aún no existe, continuar con los checks normales
  }

  // Y por último el ROL. Se pregunta por la CUENTA por la que se actúa, no por
  // la persona: el `administrador` de una cuenta es su mano derecha y hace lo
  // que ella hace, sin que haya que repartirle los clientes de uno en uno.
  //
  // Preguntando por `actor.role` —que es lo que había— un administrador no
  // pasaba nunca: el equipo se crea con rol `user` y no cambia. Desde fuera:
  // Yair, administrador de «Verzay | Atencion», llenaba el formulario de un
  // ticket a nombre de un cliente de la casa y al enviarlo le salía
  // «No autorizado», mientras que desde la cuenta madre —cuya fila SÍ tiene rol
  // de admin— el mismo formulario funcionaba. Menú abierto, puerta cerrada: la
  // pantalla que ofrece las cuentas ya preguntaba por la cuenta (`rolQueManda`)
  // y esta puerta seguía preguntando por la persona.
  //
  // Un `agente` sigue sin pasar: `cuentaQueManda` le devuelve su propio id y su
  // propio rol. Participa, pero no manda — el mismo reparto de siempre.
  const cuenta = await cuentaQueManda(actor);

  if (!isAdminOrReseller(cuenta.role)) {
    throw new Error("No autorizado.");
  }

  // Tener rol de gestión no abre CUALQUIER cuenta: nunca una de
  // superadministrador, nunca una por encima de la propia y nunca una cuenta
  // de la casa que no cuelgue de ella (`lib/alcance-entre-cuentas.ts`). Lo que
  // queda —los clientes— sigue como siempre: el admin sobre todos, el reseller
  // sobre su cartera.
  const alcance = await juzgarElAlcance({
    esSuperAdmin: false,
    cuenta: cuenta.id,
    objetivoId: cleanTarget,
    donde: "assertCanAccessTargetUser",
  });
  if (!alcance.puede) throw new Error("No autorizado.");

  if (cuenta.role === "reseller") {
    // Contra `cuenta.id` y no contra `actor.id`, por lo mismo: la cartera
    // cuelga de la cuenta del reseller, así que con el id de la persona su
    // administrador se quedaba sin permiso sobre sus propios clientes.
    const assignment = await db.reseller.findFirst({
      where: { resellerid: cuenta.id, userId: cleanTarget },
      select: { id: true },
    });
    if (!assignment) throw new Error("No autorizado.");
  }

  return actor;
}

export async function assertUserCanUseApp(targetUserId: string) {
  const actor = await assertCanAccessTargetUser(targetUserId);

  // Admin y reseller pueden gestionar clientes bloqueados desde backoffice.
  if (isAdmin(actor.role) && actor.id !== targetUserId) {
    return actor;
  }

  // Y quien ENTRÓ a otra cuenta tampoco es quien debe la licencia. Sin esto el
  // reseller cruza la pantalla de bloqueo pero cada acción de dentro se le cae:
  // entraría a una cuenta donde no puede tocar nada. currentUser() ya limitó a
  // qué cuentas puede entrar cada quien.
  if (actor.sessionUserId !== actor.id) {
    return actor;
  }

  // Igual que la pantalla de bloqueo: manda la ficha del dueño.
  const { facturacion: billing } = await facturacionQueMandaEn(targetUserId);
  const access = buildBillingServiceAccessState(billing);

  if (access.isLocked) {
    throw new Error("Acceso bloqueado por facturación.");
  }

  return actor;
}
