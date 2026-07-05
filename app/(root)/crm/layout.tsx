import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isAdvisorAccount, isAdvisorAdmin } from "@/lib/permissions";

// El CRM (registros, kanban, reportes, etc.) expone TODOS los leads del dueño.
// Solo la cuenta principal y los administradores de una cuenta vinculada; los
// agentes trabajan sus conversaciones desde /chats. Gate único para toda la
// sección /crm/*.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isAdvisorAccount(user) && !isAdvisorAdmin(user)) redirect("/");
  return <>{children}</>;
}
