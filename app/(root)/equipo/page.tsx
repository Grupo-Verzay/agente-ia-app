import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisors } from "@/actions/team-actions";
import Header from "@/components/shared/header";
import { TeamClient } from "./_components/team-client";

export default async function EquipoPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Los asesores (ownerId != null) no pueden gestionar equipo
  if ((user as any).ownerId) redirect("/");

  const res = await getTeamAdvisors();
  const advisors = res.success ? (res.data ?? []) : [];

  return (
    <div className="p-6 space-y-6">
      <Header
        title="Mi Equipo"
        subtitle="Gestiona los asesores que tienen acceso a tus conversaciones."
      />
      <TeamClient initialAdvisors={advisors} />
    </div>
  );
}
