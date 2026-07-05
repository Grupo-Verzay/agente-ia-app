import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getMacrosAction } from '@/actions/macro-actions';
import { listTagsAction } from '@/actions/tag-actions';
import { getAllRRs } from '@/actions/rr-actions';
import { getTeamAdvisors } from '@/actions/team-actions';
import { MacrosManager } from './_components/MacrosManager';

export const dynamic = 'force-dynamic';

export default async function MacrosPage() {
  const user = await currentUser();
  if (!user?.id) redirect('/');
  const ownerId = (user as any).ownerId ?? user.id;

  const [macrosRes, tagsRes, rrsRes, advisorsRes] = await Promise.all([
    getMacrosAction(),
    listTagsAction(ownerId),
    getAllRRs(ownerId),
    getTeamAdvisors(),
  ]);

  const tags = (tagsRes.success && tagsRes.data ? tagsRes.data : []).map((t: any) => ({
    id: t.id as number,
    name: t.name as string,
    color: (t.color ?? null) as string | null,
  }));
  const quickReplies = (rrsRes.success && rrsRes.data ? rrsRes.data : []).map((r: any) => ({
    id: r.id as number,
    name: (r.name ?? null) as string | null,
    mensaje: (r.mensaje ?? null) as string | null,
  }));
  const advisors = (advisorsRes.success && advisorsRes.data ? advisorsRes.data : []).map((a: any) => ({
    id: a.id as string,
    name: (a.name ?? null) as string | null,
  }));

  return (
    <MacrosManager
      initialMacros={macrosRes.success ? macrosRes.data : []}
      tags={tags}
      quickReplies={quickReplies}
      advisors={advisors}
    />
  );
}
