// app/(root)/(protected)/dashboard/finance/accounts/page.tsx

import MainFinanceAccounts from "./_components/MainFinanceAccounts";

import { db } from "@/lib/db";
import { auth } from "@/auth";

import { getFinanceAccounts } from "@/actions/finance-accounts-actions";
import { getAllSales } from "@/actions/finance-sales-actions";
import { getAllExpenses } from "@/actions/finance-expenses-actions";

import { serializePrisma } from "@/lib/serialize-prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FinanceAccountsPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  // usar ID real del usuario en BD (evita FK)
  const me = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

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
