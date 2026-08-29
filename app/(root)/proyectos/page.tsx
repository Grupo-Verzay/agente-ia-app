import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { ProjectsClient } from "./_components/ProjectsClient";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const team = await getTeamAdvisorInfos();

  return (
    <div className="flex h-full flex-col">
      <ProjectsClient
        userId={user.id}
        team={team.success ? team.data ?? [] : []}
      />
    </div>
  );
}
