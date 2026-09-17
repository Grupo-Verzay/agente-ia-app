import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { DiagramasListClient } from "./_components/DiagramasListClient";

const DiagramasPage = async () => {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full flex-col">
      {/* El orden de las tarjetas es de la CUENTA y lo coloca quien la
          administra; un agente lo ve y no lo mueve. Esto solo decide si sale el
          asa: la puerta de verdad está en `guardarElOrdenAction`. */}
      <DiagramasListClient puedeOrdenar={canManageWorkspace(user)} />
    </div>
  );
};

export default DiagramasPage;
