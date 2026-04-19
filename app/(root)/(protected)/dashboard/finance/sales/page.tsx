import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import MainSales from "./_components/MainSales";
import { getAllSales, getSalesMeta } from "@/actions/finance-sales-actions";
import { listProducts } from "@/actions/products-actions";
import { getSessionsByUserId } from "@/actions/session-action";
import { serializePrisma } from "@/lib/serialize-prisma";

export default async function SalesPage() {
  const user = await currentUser();
  if (!user?.id) return <AccessDenied />;

  const [metaRes, listRes, productsRes, sessionsRes] = await Promise.all([
    getSalesMeta(user.id),
    getAllSales(user.id),
    listProducts({ userId: user.id, q: "", page: 1, perPage: 50, onlyActive: true }),
    getSessionsByUserId(user.id, 0, 30, true),
  ]);

  if (!metaRes.success) return <div className="p-6 text-sm text-red-500">{metaRes.message}</div>;
  if (!listRes.success) return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  const meta = serializePrisma(metaRes.data!);
  const sales = serializePrisma(listRes.data || []);
  const products = serializePrisma(productsRes.items || []);
  const sessions = serializePrisma((sessionsRes as any)?.data || (sessionsRes as any) || []);

  // usar la moneda guardada en settings
  const preferredCurrencyCode =
    (user as any).preferredCurrencyCode ||
    (user as any).primaryCurrencyCode || // por si antes la tenías con otro nombre
    "COP";

  return (
    <div className="p-4 sm:p-6">
      <MainSales
        userId={user.id}
        accounts={meta.accounts}
        categories={meta.categories}
        currencies={meta.currencies}
        sales={sales}
        products={products}
        primaryCurrencyCode={preferredCurrencyCode}
        // sessions={sessions} // si luego lo necesitas
      />
    </div>
  );
}
