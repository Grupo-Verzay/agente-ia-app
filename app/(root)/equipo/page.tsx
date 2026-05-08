import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisors, getOwnerModules, type AdvisorRow, type ModuleOption } from "@/actions/team-actions";
import Header from "@/components/shared/header";
import { TeamClient } from "./_components/team-client";

export default async function EquipoPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  if ((user as any).ownerId) redirect("/");

  let advisors: AdvisorRow[] = [];
  let ownerModules: ModuleOption[] = [];
  try {
    const [advisorsRes, modulesRes] = await Promise.all([getTeamAdvisors(), getOwnerModules()]);
    advisors = advisorsRes.success ? (advisorsRes.data ?? []) : [];
    ownerModules = modulesRes.success ? (modulesRes.data ?? []) : [];
  } catch {
    // columna owner_id aún no existe en BD
  }

  return (
    <div className="p-6 space-y-6">
      <Header
        title="Mi Equipo"
        subtitle="Gestiona los asesores que tienen acceso a tus conversaciones."
      />
      <TeamClient initialAdvisors={advisors} ownerModules={ownerModules} />
    </div>
  );
}
