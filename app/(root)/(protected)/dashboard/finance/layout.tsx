import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';
import { FinanceOverviewHeader } from './_components/FinanceOverviewHeader';

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  // Finanzas de PLATAFORMA (Verzay): solo super admin / admin. Resellers y clientes
  // van a su home (/ no redirige → sin bucle). Cada quien ve su propia finanza.
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) redirect('/');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FinanceOverviewHeader />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
