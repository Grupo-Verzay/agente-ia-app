import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { ProjectsClient } from "./_components/ProjectsClient";
import { RepartoDelTrabajo } from "./_components/RepartoDelTrabajo";
import { leerElTrabajo } from "@/actions/trabajo-de-tarea-actions";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  // `leerElTrabajo` devuelve `null` a quien no administra la cuenta, así que
  // el bloque ni se pinta. La puerta está en la consulta y no aquí: una
  // pantalla no puede abrir más de lo que la consulta deja.
  const [team, trabajo] = await Promise.all([getTeamAdvisorInfos(), leerElTrabajo()]);

  return (
    <div className="flex h-full flex-col">
      <ProjectsClient
        userId={user.id}
        team={team.success ? team.data ?? [] : []}
        repartoDelTrabajo={trabajo ? <RepartoDelTrabajo cierres={trabajo.cierres} /> : null}
      />
    </div>
  );
}
