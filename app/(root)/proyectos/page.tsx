import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
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
      {/* El orden de las tarjetas es de la CUENTA y lo coloca quien la
          administra; un agente lo ve y no lo mueve. Esto solo decide si sale el
          asa: la puerta de verdad está en `guardarElOrdenAction`. */}
      <ProjectsClient
        puedeOrdenar={canManageWorkspace(user)}
        userId={user.id}
        team={team.success ? team.data ?? [] : []}
        repartoDelTrabajo={trabajo ? <RepartoDelTrabajo cierres={trabajo.cierres} /> : null}
      />
    </div>
  );
}
