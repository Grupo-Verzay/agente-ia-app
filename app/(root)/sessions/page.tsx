
import Header from "@/components/shared/header";
import { currentUser } from "@/lib/auth"; // Ahora SÍ aquí
import { redirect } from 'next/navigation';
import { SessionsContent } from "./_components/sessions-content";
import { listTagsAction } from "@/actions/tag-actions";
import { isAdvisorAccount, isAdvisorAdmin } from "@/lib/permissions";

export default async function SessionsPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  };

  // Los leads/registros los administra la cuenta principal y los administradores
  // de una cuenta vinculada. Los AGENTES (asesores normales) no ven /sessions;
  // trabajan sus conversaciones desde /chats. Nota: cuando el dueño de una cuenta
  // entra a administrar OTRA cuenta como administrador, isAdvisorAdmin=true, así
  // que sigue viendo /sessions de esa cuenta.
  if (isAdvisorAccount(user) && !isAdvisorAdmin(user)) {
    redirect('/');
  }

  const tagsRes = await listTagsAction(user.effectiveId);

  const allTags =
    tagsRes.data?.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      order: t.order ?? 0,
      sessionCount: t._count?.sessionTags ?? 0,

    })) ?? [];

  return (
    <SessionsContent userId={user.effectiveId} allTags={allTags} />
  );
}
