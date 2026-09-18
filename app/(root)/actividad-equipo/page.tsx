import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { leerLaActividad } from "@/actions/actividad-del-equipo-actions";
import { ActividadClient } from "./_components/ActividadClient";

export const dynamic = "force-dynamic";

/**
 * Actividad del equipo: dónde pasa su jornada cada persona y qué hizo.
 *
 * **Esta ruta no está montada en ningún módulo**: entra en `navigationRoutes`
 * —el desplegable de «Editar módulo»— y se asigna a mano. Como con `/cobros`,
 * eso significa que el guardián del layout no la cierra mientras nadie la
 * asigne, así que **la puerta va en la acción y no aquí**: `leerLaActividad`
 * decide a quién alcanza cada quien y esta página pinta lo que le devuelva.
 *
 * Por eso quien entre sin permiso no ve «Acceso denegado» sobre los datos de
 * otro: ve **los suyos**, que es lo que le toca. Un asesor siempre puede mirar
 * su propia jornada.
 */
export default async function ActividadDelEquipoPage() {
    const user = await currentUser();
    if (!user) redirect("/login");

    const datos = await leerLaActividad();

    return <ActividadClient inicial={datos} />;
}
