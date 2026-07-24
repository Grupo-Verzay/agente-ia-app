import AccessDenied from "@/app/AccessDenied";
import { getFinanceUser } from "@/lib/finance-user";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import MainSales from "./_components/MainSales";
import { getAllSales, getSalesMeta } from "@/actions/finance-sales-actions";
import { listProducts } from "@/actions/products-actions";
import { getSessionsByUserId } from "@/actions/session-action";
import { serializePrisma } from "@/lib/serialize-prisma";

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: { month?: string | string[]; create?: string | string[] };
}) {
  const user = await getFinanceUser();
  if (!user?.id) return <AccessDenied />;

  // Dinero (cuentas, ventas, categorías) → cuenta del titular (finance-user).
  // Catálogo de productos y contactos → cuenta operativa (la misma de /products
  // y del CRM, resuelta por effectiveId), para que la venta liste los productos
  // reales y no los de otra cuenta.
  const auth = await currentUser();
  const opScopeId = auth?.effectiveId ?? auth?.id ?? user.id;

  const [metaRes, listRes, productsRes, sessionsRes] = await Promise.all([
    getSalesMeta(user.id),
    getAllSales(user.id),
    listProducts({ userId: opScopeId, q: "", page: 1, perPage: 50, onlyActive: true }),
    getSessionsByUserId(opScopeId, 0, 30, true),
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
      accounts={meta.accounts}
      categories={meta.categories}
      currencies={meta.currencies}
      sales={sales}
      products={products}
      primaryCurrencyCode={preferredCurrencyCode}
      initialMonth={Array.isArray(searchParams?.month) ? searchParams?.month[0] : searchParams?.month}
      autoOpenCreate={(Array.isArray(searchParams?.create) ? searchParams?.create[0] : searchParams?.create) === "1"}
      // sessions={sessions} // si luego lo necesitas
    />
  );
}
