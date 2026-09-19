"use client";

import { LogIn, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { abrirLaReunionAqui } from "@/components/video/ReunionEnLaPlataforma";

/**
 * Una reunión nombrada en un mensaje, como tarjeta y no como dirección.
 *
 * Una dirección de reunión son ochenta caracteres de `base64url` que no dicen
 * nada: pegada en la burbuja ocupa tres renglones y hay que pulsarla para
 * saber de qué era. La tarjeta dice el nombre y lleva el botón, que es lo que
 * alguien va a pulsar de todas formas.
 *
 * Y entra **dentro de la plataforma**, no en una pestaña: quien lee esto tiene
 * sesión, así que no hay por qué sacarle del canal donde se está hablando de lo
 * que se va a reunir.
 *
 * # Lo que hace cuando no sabe el nombre
 *
 * El nombre solo llega si la reunión es **de este canal** —la consulta va
 * acotada, para no enseñar el título de una reunión que quien lee no alcanza—.
 * Sin nombre la tarjeta se pinta igual, genérica y pulsable: la puerta de
 * verdad está al entrar, no al pintar, y una tarjeta que no se deja pulsar
 * porque aquí no se sabe el título sería cerrar una puerta en el sitio
 * equivocado.
 */
export function TarjetaDeReunion({
    codigo,
    titulo,
    abierta,
}: {
    codigo: string;
    titulo?: string | null;
    /**
     * Si el enlace sigue valiendo.
     *
     * `undefined` es «no se sabe» —una reunión de otro canal— y **no** es lo
     * mismo que `false`. Dar por cerrada una reunión que sí está abierta deja
     * a alguien fuera de una reunión que le estaban pasando.
     */
    abierta?: boolean;
}) {
    const cerrada = abierta === false;

    return (
        <div className="my-1 flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    cerrada ? "bg-muted" : "bg-sky-500/15"
                }`}
            >
                <Video
                    className={`h-4 w-4 ${cerrada ? "text-muted-foreground" : "text-sky-500"}`}
                />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                    {titulo?.trim() || "Reunión de video"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                    {cerrada ? "El enlace ya no está activo" : "Hasta 4 personas"}
                </span>
            </span>
            {/* Una reunión cerrada no ofrece botón: uno que al pulsarlo da
                error es peor que no tenerlo, y aquí ya se sabe que va a dar
                error. */}
            {cerrada ? null : (
                <Button
                    size="sm"
                    className="h-7 shrink-0 px-2"
                    onClick={() => abrirLaReunionAqui(codigo)}
                >
                    <LogIn className="mr-1 h-3.5 w-3.5" />
                    Entrar
                </Button>
            )}
        </div>
    );
}
