import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CatalogoPanel } from './_components/CatalogoPanel';

export default async function CatalogoPanelPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <CatalogoPanel userId={user.effectiveId as string} />;
}
