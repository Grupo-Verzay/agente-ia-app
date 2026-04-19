import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAllExpenses, getExpensesMeta } from "@/actions/finance-expenses-actions";
import MainExpenses from "./_components/MainExpenses";
import { serializePrisma } from "@/lib/serialize-prisma";

export default async function ExpensesPage() {
  const user = await currentUser();
  if (!user?.id) return <AccessDenied />;

  const [metaRes, listRes] = await Promise.all([
    getExpensesMeta(user.id),
    getAllExpenses(user.id),
  ]);

  if (!metaRes.success)
    return <div className="p-6 text-sm text-red-500">{metaRes.message}</div>;
  if (!listRes.success)
    return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  // CLAVE: convertir Decimal/Date -> plain objects
  const meta = serializePrisma(metaRes.data!);
  const expenses = serializePrisma(listRes.data || []);

  // usar la moneda guardada en settings (igual que Sales)
  const preferredCurrencyCode =
    (user as any).preferredCurrencyCode ||
    (user as any).primaryCurrencyCode || // fallback por si antes existía ese campo
    "COP";

  return (
    <MainExpenses
      userId={user.id}
      accounts={meta.accounts}
      categories={meta.categories}
      currencies={meta.currencies}
      expenses={expenses}
      primaryCurrencyCode={preferredCurrencyCode}
    />
  );
}