"use client";

import { cn } from "@/lib/utils";

/**
 * La pastilla de filtro con su contador: la de Chats (Mías, Todos, Sin leer,
 * En espera) y la de Correo (Todos, Sin leer, Leídos).
 *
 * Vivía escrita dentro de `ChatTabBar`, y Correo tenía otro mando —el grupo de
 * botones de Llamadas— para la misma pregunta. Puestas las dos pantallas lado
 * a lado se leían como dos plataformas. Ahora la pintan las dos desde aquí:
 * **el día que se afine el alto, el hueco o la insignia se afina una vez.**
 */

/**
 * El hueco de los lados de una pastilla, y ENCOGE.
 *
 * Es un `<span>` de verdad y no un `px-2` porque **el padding no se encoge**:
 * en un flex lo que cede es un HIJO, y un padding no lo es. Siendo un hijo con
 * `shrink`, cede él antes que el texto, que va `shrink-0`: **solo cuando falta
 * ancho, y solo lo que falte.** Con sitio de sobra mide sus 8 px.
 *
 * Y tampoco es un `::before`: **un pseudo-elemento de un `<button>` no llega a
 * ser un hijo del flex** (medido en Chromium: 0 px incluso en 600 px de ancho).
 */
export const HUECO_QUE_ENCOGE = "block w-2 min-w-0 shrink";

/**
 * El hueco entre el rótulo y su contador, y también ENCOGE. Es la mitad de
 * ancho que los de los lados, así que cede la mitad: el número se acerca a su
 * rótulo antes de que la pastilla se acerque a su borde.
 */
export const HUECO_ENTRE = "block w-1 min-w-0 shrink";

/**
 * Lo común a todas las pastillas. **Sin `shrink-0` y con `min-w-0`**: es lo que
 * deja que el hueco de dentro ceda.
 */
export const PASTILLA = "inline-flex h-6 min-w-0 items-center justify-center rounded-full border text-xs font-medium whitespace-nowrap transition-all";

/** La insignia del contador. Su separación la pone `HUECO_ENTRE`, no un margen. */
export const INSIGNIA = "flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white";

/**
 * El color de una pastilla. Dos formas, y las dos existían ya en Chats: por
 * HEX (Mías, Todos: el tono se compone con alfa en `style`) o por CLASES
 * literales (Sin leer, En espera). Las clases van escritas enteras porque
 * Tailwind solo genera lo que ve literal.
 */
export type TonoDePastilla =
    | { hex: string }
    | { activa: string; inactiva: string; insignia: string };

export const TONO_MIAS: TonoDePastilla = { hex: "#7C3AED" };
export const TONO_TODOS: TonoDePastilla = { hex: "#007BFF" };
export const TONO_SIN_LEER: TonoDePastilla = {
    activa: "border-orange-500 bg-orange-500 text-white",
    inactiva:
        "border-orange-300 bg-orange-50 text-orange-500 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20",
    insignia: "#f97316",
};
export const TONO_EN_ESPERA: TonoDePastilla = {
    activa: "border-rose-600 bg-rose-600 text-white",
    inactiva:
        "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20",
    insignia: "#e11d48",
};
/** Leídos (Correo): verde, el color del «ya está» y libre en esta familia. */
export const TONO_LEIDOS: TonoDePastilla = {
    activa: "border-emerald-600 bg-emerald-600 text-white",
    inactiva:
        "border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20",
    insignia: "#059669",
};

export function PastillaDeFiltro({
    rotulo,
    activa,
    alPulsar,
    tono,
    cuenta,
    title,
    tabular,
    valor,
}: {
    rotulo: string;
    activa: boolean;
    alPulsar: () => void;
    tono: TonoDePastilla;
    /**
     * Lo que va en la insignia. En cero (o sin él) NO se pinta insignia: un «0»
     * se lee como un dato y lo que dice ya lo dice la ausencia.
     */
    cuenta?: number | string;
    title?: string;
    /** Cifras de ancho fijo: la insignia no cambia de ancho al subir. */
    tabular?: boolean;
    /** Para el banco y para quien mira el DOM: qué filtro es. */
    valor?: string;
}) {
    const hayCuenta = cuenta !== undefined && cuenta !== 0 && cuenta !== "0";
    const porHex = "hex" in tono;
    return (
        <button
            type="button"
            onClick={alPulsar}
            title={title}
            aria-pressed={activa}
            data-pastilla-de-filtro={valor}
            className={cn(PASTILLA, !porHex && (activa ? tono.activa : tono.inactiva))}
            style={
                porHex
                    ? activa
                        ? { background: tono.hex, borderColor: tono.hex, color: "#fff" }
                        : { borderColor: `${tono.hex}50`, color: tono.hex, background: `${tono.hex}10` }
                    : undefined
            }
        >
            <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
            <span className="shrink-0">{rotulo}</span>
            {hayCuenta && (
                <>
                    <span aria-hidden="true" className={HUECO_ENTRE} />
                    <span
                        data-insignia-de-pastilla
                        className={cn(INSIGNIA, tabular && "tabular-nums")}
                        style={{ background: activa ? "rgba(255,255,255,0.3)" : porHex ? tono.hex : tono.insignia }}
                    >
                        {cuenta}
                    </span>
                </>
            )}
            <span aria-hidden="true" className={HUECO_QUE_ENCOGE} />
        </button>
    );
}
