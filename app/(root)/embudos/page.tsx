import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
    elTableroDelEmbudo,
    laCuentaConLaQueAbre,
    quienMiraElTablero,
} from "@/lib/tablero-de-embudo.server";
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

    /*
     * Sin `?cuenta=` se abre donde se estaba mirando la última vez, no siempre
     * en la propia: quien trabaja a diario en el tablero de una hija tenía que
     * elegirla en cada visita.
     *
     * El orden no es indiferente: **manda la URL**. Un enlace guardado o
     * compartido apunta a una cuenta concreta y tiene que llevar ahí, o deja de
     * ser un enlace. Y lo recordado no abre ninguna puerta: `quienMiraElTablero`
     * lo filtra contra las alcanzables igual que a cualquier otro parámetro.
     */
    const pedida = uno(searchParams?.cuenta) ?? (await laCuentaConLaQueAbre(user));

    const { quien, ...cuentas } = await quienMiraElTablero(user, pedida);
    const tablero = await elTableroDelEmbudo(quien, uno(searchParams?.embudo), uno(searchParams?.asesor), {
        disponibles: cuentas.cuentas,
        puedeElegir: cuentas.puedeElegirCuenta,
        recortadas: cuentas.cuentasRecortadas,
    });

    return <EmbudosClient inicial={tablero} />;
}
