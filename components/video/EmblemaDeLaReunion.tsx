"use client";

import { useState } from "react";
import { Video } from "lucide-react";

/**
 * El emblema de la puerta de una reunión: el logo del negocio y, si no hay
 * —o si la imagen no carga—, el icono de cámara de siempre como respaldo.
 *
 * El logo es la MISMA fuente que la pantalla de agendar (`User.image` de la
 * cuenta dueña, resuelto en el servidor por `elLogoDeLaCuenta`). Aquí solo se
 * pinta: si llega vacío se cae al icono, y si el `<img>` da error de carga
 * (404, dominio no permitido) también —que es lo que pedía el encargo: «si la
 * cuenta no tiene logo, deja el icono actual»—.
 *
 * Es un `<img>` normal y no `next/image` a propósito: el logo de un negocio
 * puede vivir en el dominio de un reseller, que no está en la lista de
 * `remotePatterns` de `next.config.js`, y `next/image` lo tumbaría; el `<img>`
 * lo carga igual y su `onError` cae al icono sin romper nada.
 *
 * Vive en su propio fichero, sin importar ninguna acción, para poder montarlo
 * en el banco de pintado sin arrastrar la cadena de `LaReunion`.
 */
export function EmblemaDeLaReunion({ logo }: { logo: string | null }) {
    const [roto, setRoto] = useState(false);
    const hayLogo = Boolean(logo) && !roto;
    return (
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
            {hayLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logo as string}
                    alt="Logo del negocio"
                    className="h-full w-full object-contain p-1.5"
                    onError={() => setRoto(true)}
                />
            ) : (
                <Video className="h-6 w-6 text-zinc-300" />
            )}
        </span>
    );
}
