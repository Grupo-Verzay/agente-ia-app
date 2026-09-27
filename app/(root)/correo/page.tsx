import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { CorreoClient } from "./_components/CorreoClient";

export const dynamic = "force-dynamic";

/**
 * Correo: un canal APARTE de Chats, y de una sola persona.
 *
 * **Esta ruta no está montada en ningún módulo**: entra en el desplegable de
 * «Editar módulo» y se asigna a mano, como `/cobros` y `/documentos`. Por eso
 * la puerta no está aquí sino en cada acción (`actions/correo-actions.ts`), que
 * resuelve la persona de la sesión y busca el buzón con ella en el `WHERE`.
 * Esta página solo pinta lo que le devuelvan, y lo que devuelven es SIEMPRE el
 * correo de quien mira.
 */
export default async function CorreoPage({
    searchParams,
}: {
    searchParams: { conectado?: string; error?: string };
}) {
    const user = await currentUser();
    if (!user) redirect("/login?callbackUrl=%2Fcorreo");

    return (
        <CorreoClient
            conectado={typeof searchParams.conectado === "string" ? searchParams.conectado : null}
            error={typeof searchParams.error === "string" ? searchParams.error : null}
        />
    );
}
