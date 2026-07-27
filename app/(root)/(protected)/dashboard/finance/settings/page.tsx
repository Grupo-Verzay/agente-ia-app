import { redirect } from 'next/navigation';

import { getFinanceUser } from '@/lib/finance-user';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import FinanceCurrencySettings from './_components/FinanceCurrencySettings';
import { getFinanceCurrencies } from '@/actions/finance-settings-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FinanceSettingsPage() {
  // Misma resolución que el resto de Finanzas: la cuenta que se está viendo.
  // Resolvía por email, así que al administrar otra cuenta se mostraba y editaba
  // la moneda propia y no la de esa cuenta, pese a que el resto de pantallas de
  // Finanzas ya formatean sus importes con la de la cuenta activa.
  const me = await getFinanceUser();
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