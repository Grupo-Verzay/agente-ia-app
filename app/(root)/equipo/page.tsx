import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
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

  return (
    <TeamClient
      initialAdvisors={[]}
      ownerModules={[]}
      initialAutoAssign={{ autoAssignEnabled: false, autoAssignMaxChats: 5 }}
      teamMetrics={null}
    />
  );
}
