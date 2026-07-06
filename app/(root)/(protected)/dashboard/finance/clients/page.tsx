import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { getFinanceContacts } from "@/actions/finance-contacts-actions";
import { serializePrisma } from "@/lib/serialize-prisma";
import MainFinanceContacts from "../_contacts/MainFinanceContacts";
import type { FinanceContactRow } from "../_contacts/columns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: { create?: string | string[] };
}) {
  const user = await currentUser();
  if (!user?.id) return <AccessDenied />;

  const listRes = await getFinanceContacts(user.id, "CLIENT");
  if (!listRes.success) return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  const contacts = serializePrisma(listRes.data || []) as unknown as FinanceContactRow[];
  const autoOpenCreate =
    (Array.isArray(searchParams?.create) ? searchParams?.create[0] : searchParams?.create) === "1";

  return (
    <div className="flex flex-1 min-h-0 flex-col p-4 sm:p-6">
      <MainFinanceContacts userId={user.id} kind="CLIENT" contacts={contacts} autoOpenCreate={autoOpenCreate} />
    </div>
  );
}
