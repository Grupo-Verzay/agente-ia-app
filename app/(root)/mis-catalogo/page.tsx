import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CatalogoPanel } from '@/app/(root)/(protected)/panel/catalogo/_components/CatalogoPanel';

export default async function MiCatalogoPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <CatalogoPanel userId={user.effectiveId as string} />;
}
