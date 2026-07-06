import { FinanceOverviewHeader } from './_components/FinanceOverviewHeader';

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
