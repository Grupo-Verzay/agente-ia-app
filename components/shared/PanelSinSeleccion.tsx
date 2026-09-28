"use client";

import { cn } from "@/lib/utils";

/**
 * El panel de la derecha cuando no hay nada abierto: Chats sin conversación y
 * Correo sin correo. **Es UNO**, no dos parecidos: el icono grande, el título,
 * la frase y las tres tarjetas de acceso salen de aquí, así que el tamaño, el
 * color y el espaciado no pueden separarse entre las dos pantallas. Lo único
 * propio de cada una es qué dice y qué filtra cada tarjeta.
 *
 * Los tonos son clases LITERALES: Tailwind solo genera lo que ve escrito, así
 * que un color compuesto en tiempo de ejecución no existiría en el CSS.
 */
export type TonoDeTarjeta = "violeta" | "azul" | "naranja" | "ambar";

const TONOS: Record<TonoDeTarjeta, { caja: string; letra: string; titulo: string }> = {
    violeta: {
        caja: "border-violet-200 bg-violet-50 hover:bg-violet-100 dark:border-violet-800/50 dark:bg-violet-950/30 dark:hover:bg-violet-900/40",
        letra: "bg-violet-500",
        titulo: "text-violet-700 dark:text-violet-400",
    },
    azul: {
        caja: "border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/30 dark:hover:bg-blue-900/40",
        letra: "bg-blue-500",
        titulo: "text-blue-700 dark:text-blue-400",
    },
    naranja: {
        caja: "border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-800/50 dark:bg-orange-950/30 dark:hover:bg-orange-900/40",
        letra: "bg-orange-500",
        titulo: "text-orange-700 dark:text-orange-400",
    },
    // Destacados (Correo): el ámbar de su pastilla, como «Mías» lleva el
    // violeta de la suya. Una tarjeta es la puerta a SU filtro, y se lee con
    // el color del filtro.
    ambar: {
        caja: "border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/30 dark:hover:bg-amber-900/40",
        letra: "bg-amber-500",
        titulo: "text-amber-700 dark:text-amber-400",
    },
};

export type TarjetaDeAcceso = {
    clave: string;
    tono: TonoDeTarjeta;
    letra: string;
    titulo: string;
    texto: string;
    alPulsar: () => void;
};

/** Los iconos grandes, con el mismo trazo (heroicons outline, 1.5). */
export const ICONO_DE_CHATS =
    "M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z";
export const ICONO_DE_CORREO =
    "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75";

export function PanelSinSeleccion({
    icono,
    titulo,
    texto,
    tarjetas,
    className,
}: {
    /** El `d` del trazo del icono grande (`ICONO_DE_CHATS`, `ICONO_DE_CORREO`). */
    icono: string;
    titulo: string;
    texto: string;
    tarjetas: TarjetaDeAcceso[];
    /** Solo la visibilidad por anchura, que es de cada pantalla. */
    className?: string;
}) {
    return (
        <div
            data-panel-sin-seleccion
            className={cn(
                "h-full flex-1 flex-col items-center justify-center gap-5 select-none border-l border-border bg-muted/10 px-8",
                className,
            )}
        >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-8 ring-primary/5">
                <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-primary" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icono} />
                </svg>
            </div>
            <div className="text-center">
                <h2 className="text-xl font-bold text-foreground">{titulo}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{texto}</p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2.5">
                {tarjetas.map((t) => {
                    const tono = TONOS[t.tono];
                    return (
                        <button
                            key={t.clave}
                            type="button"
                            data-tarjeta-de-acceso={t.clave}
                            onClick={t.alPulsar}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                                tono.caja,
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                                    tono.letra,
                                )}
                            >
                                {t.letra}
                            </span>
                            <div>
                                <p className={cn("text-sm font-semibold", tono.titulo)}>{t.titulo}</p>
                                <p className="text-xs text-muted-foreground">{t.texto}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
