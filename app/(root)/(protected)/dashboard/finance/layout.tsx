import { FinanceOverviewHeader } from './_components/FinanceOverviewHeader';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <FinanceOverviewHeader />
      {children}
    </div>
  );
}
