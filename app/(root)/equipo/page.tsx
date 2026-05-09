import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisors, getOwnerModules, getAutoAssignSettings, type AdvisorRow, type ModuleOption } from "@/actions/team-actions";
import Header from "@/components/shared/header";
import { TeamClient } from "./_components/team-client";

export default async function EquipoPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  if ((user as any).ownerId) redirect("/");

  const [advisorsRes, modulesRes, autoAssignRes] = await Promise.all([
    getTeamAdvisors(),
    getOwnerModules(),
    getAutoAssignSettings(),
  ]);
  const advisors = advisorsRes.success ? (advisorsRes.data ?? []) : [];
  const ownerModules = modulesRes.success ? (modulesRes.data ?? []) : [];
  const autoAssignSettings = autoAssignRes.success && autoAssignRes.data
    ? autoAssignRes.data
    : { autoAssignEnabled: false, autoAssignMaxChats: 5 };

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
      />
    </div>
  );
}
