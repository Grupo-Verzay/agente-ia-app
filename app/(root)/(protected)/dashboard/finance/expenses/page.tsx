import AccessDenied from "@/app/AccessDenied";
import { getFinanceUser } from "@/lib/finance-user";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAllExpenses, getExpensesMeta } from "@/actions/finance-expenses-actions";
import MainExpenses from "./_components/MainExpenses";
import { serializePrisma } from "@/lib/serialize-prisma";
import { resolverLasCuentasDeFinanzas } from "@/lib/cuentas-de-finanzas";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: {
    month?: string | string[];
    create?: string | string[];
    cuentas?: string | string[];
  };
}) {
  const user = await getFinanceUser();
  if (!user?.id) return <AccessDenied />;

  // Una cuenta hija recibe `puedeElegir: false` y solo la suya. Y `elegidas`
  // vuelve a pasar por la misma puerta dentro de `getAllExpenses`.
  const cuentas = await resolverLasCuentasDeFinanzas(user.id, searchParams?.cuentas);

  const [metaRes, listRes] = await Promise.all([
    getExpensesMeta(user.id),
    getAllExpenses(user.id, cuentas.elegidas),
  ]);

  if (!metaRes.success)
    return <div className="p-6 text-sm text-red-500">{metaRes.message}</div>;
  if (!listRes.success)
    return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  // CLAVE: convertir Decimal/Date -> plain objects
  const meta = serializePrisma(metaRes.data!);
  const expenses = serializePrisma(listRes.data || []);

  // usar la moneda guardada en settings (igual que Sales)
  const preferredCurrencyCode = user.preferredCurrencyCode || "COP";

  return (
    <MainExpenses
      userId={user.id}
      accounts={meta.accounts}
      categories={meta.categories}
      currencies={meta.currencies}
      expenses={expenses}
      primaryCurrencyCode={preferredCurrencyCode}
      initialMonth={Array.isArray(searchParams?.month) ? searchParams?.month[0] : searchParams?.month}
      autoOpenCreate={(Array.isArray(searchParams?.create) ? searchParams?.create[0] : searchParams?.create) === "1"}
      cuentasDisponibles={cuentas.disponibles}
      cuentasElegidas={cuentas.elegidas}
    />
  );
}
