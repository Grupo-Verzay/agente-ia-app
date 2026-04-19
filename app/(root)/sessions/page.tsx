
import Header from "@/components/shared/header";
import { currentUser } from "@/lib/auth"; // Ahora SÍ aquí
import { redirect } from 'next/navigation';
import { SessionsContent } from "./_components/sessions-content";
import { listTagsAction } from "@/actions/tag-actions";

export default async function SessionsPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  };

  const tagsRes = await listTagsAction(user.id);

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
    <SessionsContent userId={user.id} allTags={allTags} />
  );
}
