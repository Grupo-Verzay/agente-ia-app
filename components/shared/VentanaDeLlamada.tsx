"use client";

import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import { GripVertical, Maximize2, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { comoSeLeeLaDuracion } from "@/lib/llamada-de-voz";

/**
 * La ventana flotante de una llamada, y su pastilla al plegarla.
 *
 * La usan las **dos** llamadas de la plataforma: la del directo del chat de
 * equipo y la de WhatsApp en Chats. Antes solo existía en la primera, escrita
 * dentro de ella; la de Chats era un `Dialog` que tapaba la pantalla y no
 * dejaba trabajar mientras se hablaba —que es justo lo que se hace durante una
 * llamada: mirar la conversación, buscar un dato—.
 *
 * Copiarla habría sido lo fácil y es lo que no se hace aquí: el arrastre, el
 * `w-fit`, el plegado y el contrato del `<audio>` ya costaron una vuelta cada
 * uno, y con dos copias el día que se afine uno la otra pantalla se queda
 * atrás. Eso no se ve como un error — se ve como que «en Chats la llamada a
 * veces no se deja mover».
 *
 * # El contrato que hay que respetar al usarla
 *
 * 1. **La caja de fuera sostiene la POSICIÓN, y dentro cambia lo que se
 *    pinta.** Partirla en dos ventanas —una plegada y otra desplegada—
 *    desmontaría el `<audio>` al plegar, y con él el `srcObject` que trae la
 *    voz del otro: la llamada seguiría abierta y **muda**.
 * 2. **El `<audio>` va como hijo de esta caja y FUERA de la rama de plegado**,
 *    por lo mismo.
 * 3. **Ningún botón dentro del asa.** El asa captura el puntero y el `click`
 *    de un botón de dentro no llegaría a salir. Lo dice también
 *    `useVentanaArrastrable`, que es de donde sale `asa`.
 */
export function VentanaDeLlamada({
    cajaRef,
    estilo,
    posicion,
    ancho,
    className,
    children,
}: {
    cajaRef: MutableRefObject<HTMLDivElement | null>;
    /** `undefined` mientras la posición la ponga el CSS. */
    estilo: CSSProperties | undefined;
    /**
     * `null` mientras nadie la haya arrastrado.
     *
     * No es lo mismo que unas coordenadas calculadas: mientras nadie la toque,
     * la ventana la centra el CSS y se recoloca sola al cambiar el ancho de la
     * pantalla, que es lo que se quiere para algo que acaba de aparecer.
     */
    posicion: { x: number; y: number } | null;
    /**
     * El ancho, que lo decide quien la usa porque depende de lo que lleve
     * dentro.
     *
     * **`w-fit` y nunca `w-auto` al plegarla**: sin posición propia la caja va
     * con `inset-x-0`, y un ancho automático entre `left:0` y `right:0` **se
     * estira** — la barra pequeña salía de lado a lado de la pantalla.
     */
    ancho: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            ref={cajaRef}
            style={estilo}
            className={cn(
                "fixed z-[100] rounded-xl border border-border bg-background shadow-2xl",
                posicion ? "" : "inset-x-0 top-4 mx-auto",
                ancho,
                className,
            )}
        >
            {children}
        </div>
    );
}

/**
 * La llamada plegada: el rato, con quién, ampliar y colgar.
 *
 * Es lo que deja seguir trabajando mientras se habla. Lleva **siempre** el
 * botón de colgar a la vista: una llamada plegada sin forma de cortarla es una
 * llamada abierta con el micro encendido.
 */
export function PastillaDeLlamada({
    asa,
    segundos,
    conQuien,
    onAmpliar,
    onColgar,
}: {
    /** Lo que devuelve `useVentanaArrastrable`. Se derrama en el asa. */
    asa: Record<string, unknown> & { className?: string };
    segundos: number;
    conQuien: string;
    onAmpliar: () => void;
    onColgar: () => void;
}) {
    return (
        <div className="flex items-center gap-1 py-1 pl-1 pr-1.5">
            {/* El asa se lleva el rato y el nombre: es la zona ancha y la que
                no hace nada al pulsarla, así que puede recibir el gesto sin
                competir con ningún botón. Los dos botones van FUERA. */}
            <div
                {...asa}
                className={cn(
                    "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5",
                    asa.className,
                )}
            >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-sm tabular-nums">
                    {comoSeLeeLaDuracion(segundos)}
                </span>
                <span className="max-w-[9rem] truncate text-sm text-muted-foreground">
                    {conQuien}
                </span>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onAmpliar}
                aria-label="Ampliar la llamada"
            >
                <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={onColgar}
                aria-label="Colgar"
            >
                <PhoneOff className="h-4 w-4" />
            </Button>
        </div>
    );
}
