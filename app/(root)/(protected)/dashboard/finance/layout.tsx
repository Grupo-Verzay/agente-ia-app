import { FinanceOverviewHeader } from './_components/FinanceOverviewHeader';

// La página de Finanzas es POR CUENTA: los datos se escopan por userId (ver
// page.tsx `where: { userId: me.id }`), así que cada cuenta (admin, reseller,
// cliente) ve SU propia finanza. No lleva guard de rol.
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FinanceOverviewHeader />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
