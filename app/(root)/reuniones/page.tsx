import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import {
    elHistorialDeReunionesAction,
    lasReunionesDeLaCuentaAction,
} from "@/actions/salas-de-video-actions";
import { ReunionesClient } from "./_components/ReunionesClient";

export const dynamic = "force-dynamic";

/**
 * Reuniones: las salas de video de una cuenta, por sí solas.
 *
 * Hasta ahora una sala solo existía **dentro de un canal** del chat de equipo.
 * Eso ataba Reuniones a tener chat de equipo montado y dejaba fuera el caso más
 * normal —«ábreme una sala para el cliente de las tres»—, que no es de ningún
 * canal. Ahora `canalId` es opcional y esta pantalla enseña las que no son de
 * ninguno: **una sola lista**, con dos pastillas de filtro —abiertas y
 * pasadas— en la barra de acciones.
 *
 * **Esta ruta no está montada en ningún módulo**: entra en el desplegable de
 * «Editar módulo» y se asigna a mano, igual que `/cobros`, `/chat-equipo` y
 * `/documentos`. Eso tiene una consecuencia que conviene tener presente: el
 * guardián del layout solo cierra rutas que están en algún módulo y denegadas,
 * así que mientras no se asigne, `/reuniones` se alcanza escribiendo la URL.
 *
 * Por eso **la puerta no está aquí**: cada acción resuelve la cuenta de quien
 * mira y esta página solo pinta lo que le devuelvan. Las listas llegan ya
 * acotadas a su `cuentaId`, así que una cuenta cliente ve y crea nada más que
 * las suyas.
 *
 * Y el panel de la reunión **no se monta aquí**: `ReunionEnLaPlataforma` cuelga
 * del layout, así que entrar desde esta pantalla y luego irse a Clientes no
 * corta la reunión. Desde aquí solo se le dice qué sala abrir.
 */
export default async function ReunionesPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    // Las dos en la misma vuelta: la pantalla no sirve de nada con una sola, y
    // pedirlas en dos cargas sería enseñar media pantalla y que la otra mitad
    // salte un segundo después.
    const [vivas, historial] = await Promise.all([
        lasReunionesDeLaCuentaAction(),
        elHistorialDeReunionesAction(),
    ]);

    return (
        <ReunionesClient
            inicial={vivas.success ? vivas.salas : []}
            /* La familia trae varias cuentas: se pinta a quién pertenece cada
               sala. En una cuenta sola sería repetir su nombre en cada fila. */
            variasCuentas={
                (vivas.success && vivas.variasCuentas) ||
                (historial.success && historial.variasCuentas)
            }
            puedoAbrir={vivas.success ? vivas.puedoAbrir : false}
            /* Quién puede dejar un enlace SIN caducidad lo decide el servidor
               (`canManageWorkspace`) y baja como dato: la pantalla no vuelve a
               preguntarlo, o el desplegable ofrecería una opción que la acción
               rechaza. */
            puedoNoCaducar={vivas.success ? vivas.puedoNoCaducar : false}
            historial={historial.success ? historial.reuniones : []}
            dias={historial.success ? historial.dias : 90}
            /* Un fallo de carga NO se calla: una pantalla vacía sin motivo se
               lee como «no hay reuniones», que es una respuesta distinta. */
            fallo={!vivas.success ? vivas.message : !historial.success ? historial.message : null}
        />
    );
}
