'use server'

import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { puedoPublicarActualizacionesAction } from "@/actions/actualizaciones-actions";
import { MainActualizaciones } from "./_components/MainActualizaciones";

/**
 * Documentación › Actualizaciones: publicar lo que le salta a toda la
 * plataforma. Es de la CASA (`quienMandaEnLaCasa`); la puerta de verdad está en
 * las acciones, esto solo evita pintar un formulario que no va a funcionar.
 */
const ActualizacionesPage = async () => {
    const user = await currentUser();
    if (!user) return null;
    if (!(await puedoPublicarActualizacionesAction())) return <AccessDenied detalle="Publicar actualizaciones es solo de las cuentas administradoras de la plataforma." />;
    return <MainActualizaciones cuentaId={user.id} />;
};

export default ActualizacionesPage;
