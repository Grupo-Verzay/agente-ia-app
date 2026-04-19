import { RegistroWithSession } from "@/types/session";

export function getDisplayNombreFromRegistro(r: RegistroWithSession) {
    return (
        r.nombre || // snapshot en Registro
        r.session.pushName ||
        "Sin nombre"
    );
}
