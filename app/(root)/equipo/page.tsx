import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isAdvisorAccount, isAdvisorAdmin } from "@/lib/permissions";
import { TeamClient } from "./_components/team-client";
import { rolQueAbrePuertas } from "@/lib/sidebar-modules";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { ofreceReiniciarVinculos, ofreceVincularCuentas, pideContrasenaParaVincular } from "@/lib/vincular-cuentas";
import {
  getAutoAssignSettings,
  getOwnerModules,
  getTeamAdvisors,
  getTeamMetrics,
  tieneClientesQueAsignar,
} from "@/actions/team-actions";
import { cuentasParaMudarAction } from "@/actions/mudanza-de-persona-actions";

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error("[EquipoPage]", error);
    return null;
  }
}

export default async function EquipoPage() {
  const user = await settle(currentUser());
  if (!user) redirect("/login");

  // Gestión de equipo: la cuenta principal y los administradores de una cuenta
  // vinculada. Los agentes no (solo operan desde /chats).
  if (isAdvisorAccount(user) && !isAdvisorAdmin(user)) redirect("/");

  const [advisors, ownerModules, autoAssignSettings, teamMetrics, conClientes, cuentasParaMudar] = await Promise.all([
    settle(getTeamAdvisors()),
    settle(getOwnerModules()),
    settle(getAutoAssignSettings()),
    settle(getTeamMetrics()),
    settle(tieneClientesQueAsignar()),
    settle(cuentasParaMudarAction()),
  ]);

  return (
    <TeamClient
      userId={user.effectiveId}
      initialAdvisors={advisors?.success && advisors.data ? advisors.data : []}
      ownerModules={ownerModules?.success && ownerModules.data ? ownerModules.data : []}
      initialAutoAssign={
        autoAssignSettings?.success && autoAssignSettings.data
          ? autoAssignSettings.data
          : { autoAssignEnabled: false, autoAssignMaxChats: 5, modo: "maximo" as const, porcentajes: {} }
      }
      teamMetrics={teamMetrics?.success && teamMetrics.data ? teamMetrics.data : null}
      // Sin respuesta se deja la opción puesta: se ve de más, nunca de menos.
      conClientesQueAsignar={conClientes ?? true}
      // «Mover a otra cuenta» solo si hay otra cuenta a la que mover: la lista
      // trae también la propia, así que hace falta más de una. La misma lista
      // con la que el diálogo ofrece el destino; sin respuesta, se ve de más.
      hayCuentasParaMudar={cuentasParaMudar ? cuentasParaMudar.success && (cuentasParaMudar.data?.length ?? 0) > 1 : true}
      // Quien administra esta cuenta vincula: la casa lo que ya alcanza, un
      // cliente sus propias cuentas con la contraseña de cada una.
      puedeVincular={ofreceVincularCuentas({ rol: rolQueAbrePuertas(user), administraLaCuenta: canManageWorkspace(user) })}
      pideContrasena={pideContrasenaParaVincular(rolQueAbrePuertas(user))}
      puedeReiniciarVinculos={ofreceReiniciarVinculos(esSuperAdminDeVerdad(user))}
    />
  );
}
