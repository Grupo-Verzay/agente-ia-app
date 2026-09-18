import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { leerElArbolAction } from "@/actions/documentacion-actions";
import { DocumentacionClient } from "./_components/DocumentacionClient";

export const dynamic = "force-dynamic";

/**
 * Documentación: los documentos de la cuenta, en espacios.
 *
 * **Esta ruta no está montada en ningún módulo**: entra en el desplegable de
 * «Editar módulo» y se asigna a mano, igual que `/cobros` y `/chat-equipo`. Eso
 * tiene una consecuencia que conviene tener presente: el guardián del layout
 * solo cierra rutas que están en algún módulo y denegadas, así que mientras no
 * se asigne, `/documentos` se alcanza escribiendo la URL.
 *
 * Por eso **la puerta no está aquí**: cada acción resuelve el acceso con
 * `acceso-al-documento`, y esta página solo pinta lo que le devuelvan. El árbol
 * llega ya filtrado con la cuenta de quien mira, así que nadie ve el de otra.
 *
 * Y por eso mismo **se puede ofrecer como módulo a una cuenta cliente sin
 * tocar código**: asignarle la pestaña le da su propia documentación, no la de
 * la casa.
 */
export default async function DocumentacionPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    const arbol = await leerElArbolAction();

    return (
        <div className="flex h-full min-h-0 flex-col">
            <DocumentacionClient inicial={arbol} />
        </div>
    );
}
