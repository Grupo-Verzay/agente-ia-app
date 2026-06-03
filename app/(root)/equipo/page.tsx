import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisors, getOwnerModules, getAutoAssignSettings, getTeamMetrics, type AdvisorRow, type ModuleOption, type TeamMetrics } from "@/actions/team-actions";
import { TeamClient } from "./_components/team-client";

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

  if (user.ownerId) redirect("/");

  const [advisorsRes, modulesRes, autoAssignRes, metricsRes] = await Promise.all([
    settle(getTeamAdvisors()),
    settle(getOwnerModules()),
    settle(getAutoAssignSettings()),
    settle(getTeamMetrics()),
  ]);
  const advisors = advisorsRes?.success ? (advisorsRes.data ?? []) : [];
  const ownerModules = modulesRes?.success ? (modulesRes.data ?? []) : [];
  const autoAssignSettings = autoAssignRes?.success && autoAssignRes.data
    ? autoAssignRes.data
    : { autoAssignEnabled: false, autoAssignMaxChats: 5 };
  const teamMetrics = metricsRes?.success ? metricsRes.data ?? null : null;

  return (
    <TeamClient
      initialAdvisors={advisors}
      ownerModules={ownerModules}
      initialAutoAssign={autoAssignSettings}
      teamMetrics={teamMetrics}
    />
  );
}
