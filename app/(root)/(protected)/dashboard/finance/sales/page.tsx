import AccessDenied from "@/app/AccessDenied";
import { getFinanceUser } from "@/lib/finance-user";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import MainSales from "./_components/MainSales";
import { getAllSales, getSalesMeta } from "@/actions/finance-sales-actions";
import { listProducts } from "@/actions/products-actions";
import { getSessionsByUserId } from "@/actions/session-action";
import { serializePrisma } from "@/lib/serialize-prisma";
import { resolverLasCuentasDeFinanzas } from "@/lib/cuentas-de-finanzas";

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: {
    month?: string | string[];
    create?: string | string[];
    q?: string | string[];
    cuentas?: string | string[];
  };
}) {
  // Dinero (cuentas, ventas, categorías) y catálogo (productos, contactos) van a
  // la MISMA cuenta: la que se está viendo. getFinanceUser ya resuelve por
  // effectiveId, igual que /products y el CRM, así que la venta lista los
  // productos reales de esa cuenta y no los de otra.
  const user = await getFinanceUser();
  if (!user?.id) return <AccessDenied />;

  // Qué cuentas se miran. Lo resuelve el servidor contra la familia: una cuenta
  // hija recibe `puedeElegir: false` y solo la suya, que es el caso de siempre.
  // Y `elegidas` vuelve a pasar por la misma puerta dentro de `getAllSales`:
  // que esta página ya lo haya filtrado no lo da por bueno la acción.
  const cuentas = await resolverLasCuentasDeFinanzas(user.id, searchParams?.cuentas);

  const [metaRes, listRes, productsRes, sessionsRes] = await Promise.all([
    getSalesMeta(user.id),
    getAllSales(user.id, cuentas.elegidas),
    listProducts({ userId: user.id, q: "", page: 1, perPage: 50, onlyActive: true }),
    getSessionsByUserId(user.id, 0, 30, true),
  ]);

  if (!metaRes.success) return <div className="p-6 text-sm text-red-500">{metaRes.message}</div>;
  if (!listRes.success) return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  const meta = serializePrisma(metaRes.data!);
  const sales = serializePrisma(listRes.data || []);
  const products = serializePrisma(productsRes.items || []);
  const sessions = serializePrisma(sessionsRes?.data || []);

  // usar la moneda guardada en settings
  const preferredCurrencyCode = user.preferredCurrencyCode || "COP";

  return (
    <MainSales
      userId={user.id}
      catalogUserId={user.id}
      accounts={meta.accounts}
      categories={meta.categories}
      currencies={meta.currencies}
      sales={sales}
      products={products}
      primaryCurrencyCode={preferredCurrencyCode}
      initialMonth={Array.isArray(searchParams?.month) ? searchParams?.month[0] : searchParams?.month}
      autoOpenCreate={(Array.isArray(searchParams?.create) ? searchParams?.create[0] : searchParams?.create) === "1"}
      initialSearch={Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q}
      cuentasDisponibles={cuentas.disponibles}
      cuentasElegidas={cuentas.elegidas}
      // sessions={sessions} // si luego lo necesitas
    />
  );
}
