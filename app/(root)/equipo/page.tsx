import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisors, getOwnerModules, getAutoAssignSettings, getTeamMetrics, type AdvisorRow, type ModuleOption, type TeamMetrics } from "@/actions/team-actions";
import Header from "@/components/shared/header";
import { TeamClient } from "./_components/team-client";

export default async function EquipoPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  if ((user as any).ownerId) redirect("/");

  const [advisorsRes, modulesRes, autoAssignRes, metricsRes] = await Promise.all([
    getTeamAdvisors(),
    getOwnerModules(),
    getAutoAssignSettings(),
    getTeamMetrics(),
  ]);
  const advisors = advisorsRes.success ? (advisorsRes.data ?? []) : [];
  const ownerModules = modulesRes.success ? (modulesRes.data ?? []) : [];
  const autoAssignSettings = autoAssignRes.success && autoAssignRes.data
    ? autoAssignRes.data
    : { autoAssignEnabled: false, autoAssignMaxChats: 5 };
  const teamMetrics = metricsRes.success ? metricsRes.data ?? null : null;

  return (
    <div className="p-6 space-y-6">
      <Header
        title="Mi Equipo"
        subtitle="Gestiona los asesores que tienen acceso a tus conversaciones."
      />
      <TeamClient
        initialAdvisors={advisors}
        ownerModules={ownerModules}
        initialAutoAssign={autoAssignSettings}
        teamMetrics={teamMetrics}
      />
    </div>
  );
}
