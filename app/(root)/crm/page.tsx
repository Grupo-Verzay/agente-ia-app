import { redirect } from "next/navigation";

/*
 * `/crm` era una lista vieja de leads, fuera de todo menú, que repetía lo que
 * ya hacen Leads (`/sessions`) y CRM › Registros. Se quitó: quien llegue aquí
 * —un enlace guardado, el buscador o Verzy— aterriza en Registros, con el
 * filtro de cuentas si lo traía.
 */
export default function CrmPage({
    searchParams,
}: {
    searchParams?: { cuentas?: string | string[] };
}) {
    const cuentas = searchParams?.cuentas;
    const valor = Array.isArray(cuentas) ? cuentas.join(",") : cuentas;
    redirect(valor ? `/crm/registros?cuentas=${encodeURIComponent(valor)}` : "/crm/registros");
}
