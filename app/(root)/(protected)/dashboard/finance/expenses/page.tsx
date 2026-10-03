import AccessDenied from "@/app/AccessDenied";
import { getFinanceUser } from "@/lib/finance-user";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAllExpenses, getExpensesMeta } from "@/actions/finance-expenses-actions";
import MainExpenses from "./_components/MainExpenses";
import { serializePrisma } from "@/lib/serialize-prisma";
import { resolverLasCuentasDeFinanzas } from "@/lib/cuentas-de-finanzas";
import { getFinanceContacts } from "@/actions/finance-contacts-actions";
import { elFormularioAlEntrar } from "@/lib/compras-de-finanzas";

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

  // Los proveedores de una compra son los de la cuenta PROPIA, sin consolidar:
  // es donde se guarda la compra, y el servidor comprueba que el proveedor sea
  // de esa misma cuenta (`createExpense`).
  const [metaRes, listRes, proveedoresRes] = await Promise.all([
    getExpensesMeta(user.id),
    getAllExpenses(user.id, cuentas.elegidas),
    // Una lista de proveedores que no se pudo leer no puede tumbar Gastos.
    getFinanceContacts(user.id, "SUPPLIER").catch((e) => ({
      success: false,
      message: e instanceof Error ? e.message : String(e),
      data: [],
    })),
  ]);

  if (!metaRes.success)
    return <div className="p-6 text-sm text-red-500">{metaRes.message}</div>;
  if (!listRes.success)
    return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  // CLAVE: convertir Decimal/Date -> plain objects
  const meta = serializePrisma(metaRes.data!);
  const expenses = serializePrisma(listRes.data || []);
  // Una lista de proveedores que no se pudo leer no puede tumbar Gastos: la
  // compra dirá que no hay proveedores, y se dice aquí por qué.
  if (!proveedoresRes.success) console.warn("[finanzas] no se pudieron leer los proveedores", proveedoresRes.message);
  const proveedores = ((proveedoresRes.data as { id: string; name: string; code: string | null; phone: string | null }[] | undefined) ?? []).map(
    (p) => ({ id: p.id, name: p.name, code: p.code ?? null, phone: p.phone ?? null }),
  );

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
      formularioAlEntrar={elFormularioAlEntrar(searchParams?.create)}
      proveedores={proveedores}
      cuentasDisponibles={cuentas.disponibles}
      cuentasElegidas={cuentas.elegidas}
    />
  );
}
