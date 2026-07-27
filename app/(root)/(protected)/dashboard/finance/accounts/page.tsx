// app/(root)/(protected)/dashboard/finance/accounts/page.tsx

import MainFinanceAccounts from "./_components/MainFinanceAccounts";

import { db } from "@/lib/db";
import { getFinanceUser } from "@/lib/finance-user";

import { getFinanceAccounts } from "@/actions/finance-accounts-actions";
import { getAllSales } from "@/actions/finance-sales-actions";
import { getAllExpenses } from "@/actions/finance-expenses-actions";

import { serializePrisma } from "@/lib/serialize-prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FinanceAccountsPage() {
  // Misma resolución que el resto de Finanzas: la cuenta que se está viendo.
  // Esta página resolvía por email, así que al administrar otra cuenta listaba
  // las cuentas propias mientras los diálogos de venta y gasto mostraban las de
  // la cuenta activa: dos listas distintas en la misma pantalla.
  const me = await getFinanceUser();
  if (!me?.id) return null;

  // monedas directo (sin getSalesMeta)
  const currencies = await db.financeCurrency.findMany({
    orderBy: { code: "asc" },
  });

  const [accRes, salesRes, expensesRes] = await Promise.all([
    getFinanceAccounts(me.id),
    getAllSales(me.id),
    getAllExpenses(me.id),
  ]);

  if (!accRes.success) {
    return <div className="p-6 text-sm text-red-500">{accRes.message}</div>;
  }

  if (!salesRes.success) {
    return <div className="p-6 text-sm text-red-500">{salesRes.message}</div>;
  }

  if (!expensesRes.success) {
    return <div className="p-6 text-sm text-red-500">{expensesRes.message}</div>;
  }

  // CLAVE: serializa Decimal -> number (y cualquier Decimal anidado)
  const accounts = serializePrisma(accRes.data ?? []);
  const sales = serializePrisma(salesRes.data ?? []);
  const expenses = serializePrisma(expensesRes.data ?? []);

  return (
    <MainFinanceAccounts
      userId={me.id}
      initialAccounts={accounts}
      currencies={currencies}
      sales={sales}
      expenses={expenses}
    />
  );
}
