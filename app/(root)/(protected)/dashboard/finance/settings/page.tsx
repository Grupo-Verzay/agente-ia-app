import { db } from '@/lib/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import FinanceCurrencySettings from './_components/FinanceCurrencySettings';
import { getFinanceCurrencies } from '@/actions/finance-settings-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FinanceSettingsPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');

  const me = await db.user.findUnique({
    where: { email },
    select: { id: true, preferredCurrencyCode: true },
  });
  if (!me?.id) redirect('/login');

  const currenciesRes = await getFinanceCurrencies();
  const currencies = currenciesRes.success ? currenciesRes.data ?? [] : [];

  return (
    <div className="space-y-3">
      <Card className="border-border">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Configuración Finance</CardTitle>
        </CardHeader>

        <CardContent className="pt-0">
          <FinanceCurrencySettings
            currentCode={me.preferredCurrencyCode ?? 'COP'}
            currencies={currencies}
          />
        </CardContent>
      </Card>
    </div>
  );
}