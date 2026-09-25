import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { elTableroDelEmbudo, quienMiraElTablero } from "@/lib/tablero-de-embudo.server";
import { EmbudosClient } from "./_components/EmbudosClient";

/*
 * Embudos va FUERA de `/crm` a propósito: el layout del CRM saca a los agentes
 * (`crm/layout.tsx`), y el tablero es justo la pantalla de trabajo del asesor.
 *
 * La ruta entra en `navigationRoutes` y no se monta en ningún módulo: se asigna
 * a mano en «Editar módulo», como `/cobros`. Por eso la puerta está en la carga
 * y en cada acción, nunca en esta página.
 *
 * Los tres parámetros viajan en la URL para que un enlace se pueda guardar y
 * compartir —igual que `?month=` en Finanzas—, y los tres se re-resuelven en el
 * servidor: la cuenta contra las que se alcanzan, el asesor contra el equipo de
 * esa cuenta y el embudo contra sus embudos.
 */
export default async function EmbudosPage({
    searchParams,
}: {
    searchParams?: { embudo?: string | string[]; cuenta?: string | string[]; asesor?: string | string[] };
}) {
    const user = await currentUser();
    if (!user) redirect("/login");

    const uno = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? null;

    const { quien, ...cuentas } = await quienMiraElTablero(user, uno(searchParams?.cuenta));
    const tablero = await elTableroDelEmbudo(quien, uno(searchParams?.embudo), uno(searchParams?.asesor), {
        disponibles: cuentas.cuentas,
        puedeElegir: cuentas.puedeElegirCuenta,
        recortadas: cuentas.cuentasRecortadas,
    });

    return <EmbudosClient inicial={tablero} />;
}
