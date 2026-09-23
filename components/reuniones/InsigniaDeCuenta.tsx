import { Building2 } from "lucide-react";

/**
 * A qué cuenta pertenece una reunión o su grabación.
 *
 * Solo se pinta cuando la familia tiene varias cuentas y la fila trae nombre:
 * en una cuenta sola sería repetir su propio nombre en cada fila, que es ruido.
 * Es lo que hace visible que la madre está mirando lo de una hija sin haber
 * cambiado de cuenta. La usan las tres pestañas de Reuniones: con una copia en
 * cada una, el día que se afine una las otras se quedan atrás.
 */
export function InsigniaDeCuenta({
    nombre,
    variasCuentas,
}: {
    nombre: string | null;
    variasCuentas: boolean;
}) {
    if (!variasCuentas || !nombre) return null;
    return (
        <span
            className="inline-flex max-w-[10rem] shrink-0 items-center gap-1 truncate rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
            title={nombre}
        >
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{nombre}</span>
        </span>
    );
}
