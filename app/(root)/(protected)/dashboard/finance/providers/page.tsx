import AccessDenied from "@/app/AccessDenied";
import { getFinanceUser } from "@/lib/finance-user";
import { getFinanceContacts } from "@/actions/finance-contacts-actions";
import { getContactFieldConfig } from "@/actions/finance-contact-fields-actions";
import { serializePrisma } from "@/lib/serialize-prisma";
import { resolverLasCuentasDeFinanzas } from "@/lib/cuentas-de-finanzas";
import { defaultFields } from "@/lib/finance-contact-fields";
import MainFinanceContacts from "../_contacts/MainFinanceContacts";
import type { FinanceContactRow } from "../_contacts/columns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams?: { create?: string | string[]; cuentas?: string | string[] };
}) {
  const user = await getFinanceUser();
  if (!user?.id) return <AccessDenied />;

  // La configuración de campos sigue siendo la de la cuenta propia: consolidar
  // enseña contactos de varias, pero las columnas las decide quien mira.
  const cuentas = await resolverLasCuentasDeFinanzas(user.id, searchParams?.cuentas);

  const [listRes, fieldRes] = await Promise.all([
    getFinanceContacts(user.id, "SUPPLIER", cuentas.elegidas),
    getContactFieldConfig(user.id, "SUPPLIER"),
  ]);
  if (!listRes.success) return <div className="p-6 text-sm text-red-500">{listRes.message}</div>;

  const contacts = serializePrisma(listRes.data || []) as unknown as FinanceContactRow[];
  const fields = fieldRes.data ?? defaultFields("SUPPLIER");
  const autoOpenCreate =
    (Array.isArray(searchParams?.create) ? searchParams?.create[0] : searchParams?.create) === "1";

  return (
    <MainFinanceContacts
      userId={user.id}
      kind="SUPPLIER"
      contacts={contacts}
      fields={fields}
      autoOpenCreate={autoOpenCreate}
      cuentasDisponibles={cuentas.disponibles}
      cuentasElegidas={cuentas.elegidas}
    />
  );
}
