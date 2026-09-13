import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isAdvisorAccount, isAdvisorAdmin } from "@/lib/permissions";
import { TeamClient } from "./_components/team-client";
import {
  getAutoAssignSettings,
  getOwnerModules,
  getTeamAdvisors,
  getTeamMetrics,
} from "@/actions/team-actions";

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

  const [advisors, ownerModules, autoAssignSettings, teamMetrics] = await Promise.all([
    settle(getTeamAdvisors()),
    settle(getOwnerModules()),
    settle(getAutoAssignSettings()),
    settle(getTeamMetrics()),
  ]);

  return (
    <TeamClient
      userId={user.effectiveId}
      initialAdvisors={advisors?.success && advisors.data ? advisors.data : []}
      ownerModules={ownerModules?.success && ownerModules.data ? ownerModules.data : []}
      initialAutoAssign={
        autoAssignSettings?.success && autoAssignSettings.data
          ? autoAssignSettings.data
          : { autoAssignEnabled: false, autoAssignMaxChats: 5 }
      }
      teamMetrics={teamMetrics?.success && teamMetrics.data ? teamMetrics.data : null}
    />
  );
}
