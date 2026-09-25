import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { elTableroDelEmbudo, quienMiraLosEmbudos } from "@/lib/tablero-de-embudo.server";
import { EmbudosClient } from "./_components/EmbudosClient";

/*
 * Embudos va FUERA de `/crm` a propósito: el layout del CRM saca a los agentes
 * (`crm/layout.tsx`), y el tablero es justo la pantalla de trabajo del asesor.
 *
 * La ruta entra en `navigationRoutes` y no se monta en ningún módulo: se asigna
 * a mano en «Editar módulo», como `/cobros`. Por eso la puerta está en la carga
 * y en cada acción, nunca en esta página.
 */
export default async function EmbudosPage({
    searchParams,
}: {
    searchParams?: { embudo?: string | string[] };
}) {
    const user = await currentUser();
    if (!user) redirect("/login");

    const pedido = Array.isArray(searchParams?.embudo) ? searchParams?.embudo[0] : searchParams?.embudo;
    const tablero = await elTableroDelEmbudo(quienMiraLosEmbudos(user), pedido ?? null);

    return <EmbudosClient inicial={tablero} />;
}
