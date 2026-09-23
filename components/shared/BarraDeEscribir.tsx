"use client";

/**
 * La barra de escribir, escrita UNA vez.
 *
 * # Lo que había
 *
 * El #790 movió a sitio común las clases (`lib/barra-de-escribir.ts`) y tres
 * componentes de pintado —`BarritaDeFormato`, `EmojiPickerPanel`,
 * `TextoConFormato`— y dejó escrito que «la barra de escribir es UNA». No lo
 * era: seguían siendo **dos implementaciones independientes**,
 * `app/(root)/chats/_components/ChatInputBar.tsx` y un compositor escrito
 * dentro de `components/chat-equipo/HiloDelEquipo.tsx`.
 *
 * Y una copia no se queda atrás en lo grande —las dos mandaban mensajes— sino
 * en lo pequeño, que es justo lo que se reporta:
 *
 * | | Chats | el chat de equipo |
 * | --- | --- | --- |
 * | pegar una captura | `onPaste` en la caja | **no existía** |
 * | icono del dictado | `AudioLines` | `Type`, o sea una **T** |
 * | las herramientas | en fila con sitio, plegadas sin él | **siempre plegadas** |
 * | el tope de la caja | en LÍNEAS (`altoDeLaCaja`) | `max-h-40`, o sea en PÍXELES |
 *
 * La última es la que más duele porque este repositorio **ya la da por
 * arreglada**: es el fallo de *el tope estaba en PÍXELES, que no es un tope en
 * líneas*, vivo en la barra de al lado porque el arreglo se hizo en una sola.
 *
 * # La regla
 *
 * > **Lo que las dos barras hacen igual vive aquí; lo que cada pantalla tiene
 * > de suyo entra por sus huecos.** De WhatsApp son la firma, el interruptor
 * > de la IA, las plantillas de Meta, las respuestas rápidas y la nota
 * > interna; del equipo, las menciones, la cita y la edición. Nada de eso se
 * > mete aquí: se le pasa.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { altoDeLaCaja } from "@/lib/alto-de-la-caja-de-escribir";
import {
    ANCHO_COMPACTO,
    BOTON_DE_HERRAMIENTA,
    BOTON_REDONDO,
    BOTON_REDONDO_EN_REPOSO,
    COLUMNA_DE_HERRAMIENTAS,
    COLUMNA_DE_VOZ,
    type BotonDeLaDerecha,
    losBotonesDeLaDerecha,
    rellenoDeLaCaja,
} from "@/lib/barra-de-escribir";

/* ───────────────────────────── el ancho ───────────────────────────── */

/**
 * Si la barra va plegada, MEDIDO.
 *
 * No se decide por pantalla: el chat de equipo vive en un panel lateral de 18
 * a 24 rem —donde siempre está plegada— y también en su propia ruta a todo lo
 * ancho, donde tiene el mismo sitio que Chats. Con la condición escrita como
 * «aquí siempre plegado», la misma barra se ve de dos maneras sin que nada lo
 * justifique, que es literalmente lo reportado («el desplegable abre distinto
 * que en Chats»).
 */
export function useBarraCompacta(): {
    compacta: boolean;
    /** Se le pasa a la barra en su `ref`. */
    medir: (nodo: HTMLElement | null) => void;
} {
    const [compacta, setCompacta] = useState(false);
    const soltar = useRef<(() => void) | null>(null);

    /*
     * Es un ref de CALLBACK y no un `useEffect` sobre un `useRef`, y la
     * diferencia se pagó entera midiendo: con el efecto, el nodo se lee UNA
     * vez —en el montaje, con `[ref]` de dependencia— y en el chat de equipo
     * la barra todavía no existe ahí, porque el hilo pinta antes su estado de
     * carga. Así que `ref.current` era `null`, el efecto se rendía y **no
     * volvía a correr nunca**: la barra se quedaba en «no compacta» para
     * siempre y a 390 px salían los tres botones de la derecha con su
     * `pr-28`, encima de una caja de 390.
     *
     * En Chats no se notaba porque allí la barra sí está pintada en el primer
     * render — o sea que el efecto funcionaba por suerte, no por diseño. Un
     * ref de callback lo llama React CUANDO el nodo aparece, que es
     * exactamente el caso que fallaba.
     */
    const medir = useCallback((nodo: HTMLElement | null) => {
        soltar.current?.();
        soltar.current = null;
        if (!nodo) return;

        const mirar = () => setCompacta(nodo.getBoundingClientRect().width < ANCHO_COMPACTO);
        mirar();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", mirar);
            soltar.current = () => window.removeEventListener("resize", mirar);
            return;
        }
        const vigia = new ResizeObserver(mirar);
        vigia.observe(nodo);
        soltar.current = () => vigia.disconnect();
    }, []);

    return { compacta, medir };
}

/* ─────────────────────────── el alto de la caja ─────────────────────────── */

/**
 * La caja crece con el texto **hasta tres renglones**, y el tope se traduce a
 * píxeles con el interlineado que de verdad tiene esa caja.
 *
 * Quien decide sigue siendo `lib/alto-de-la-caja-de-escribir.ts`, que es puro
 * y tiene su banco; lo que estaba copiado —y en el chat de equipo, escrito con
 * un tope en píxeles— era el ENGANCHE. Cada pantalla conserva lo único que es
 * suyo, `reiniciarCon`: el dato cuyo cambio significa «esta caja es otra» —el
 * chat abierto en la bandeja, el canal en el equipo— y con el que la altura en
 * línea se quita para que no quede alta con el borrador de otra conversación
 * dentro.
 */
export function useAltoDeLaCaja(opciones: {
    ref: React.RefObject<HTMLTextAreaElement>;
    texto: string;
    /** Lo que, al cambiar, quiere decir que la caja pasó a ser otra. */
    reiniciarCon?: unknown;
}): void {
    const { ref, texto, reiniciarCon } = opciones;

    const ajustar = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const cs = getComputedStyle(el);
        el.style.height = "auto";
        const { alto } = altoDeLaCaja({
            contenido: el.scrollHeight,
            interlineado: parseFloat(cs.lineHeight),
            fuente: parseFloat(cs.fontSize),
            relleno: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
            // Los bordes aparte: `box-sizing` es `border-box` —la altura los
            // incluye— y `scrollHeight` no los cuenta.
            bordes: el.offsetHeight - el.clientHeight,
        });
        el.style.height = `${alto}px`;
    }, [ref]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Vacía → se quita la altura en línea y manda el CSS (una línea).
        // Escribir un número ahí dejaría la caja alta con el borrador de otra
        // conversación dentro.
        if (!texto.trim()) {
            el.style.height = "";
            return;
        }
        ajustar();
    }, [ref, texto, reiniciarCon, ajustar]);

    /**
     * Y se vuelve a medir cuando cambia el ANCHO.
     *
     * Al abrirse un panel, al plegarse el menú o al girar un móvil el texto se
     * reparte en otro número de renglones y la altura escrita antes se queda
     * mintiendo. Se mira **solo el ancho** —lo que esto mismo cambia es el
     * alto—, así que no hay bucle.
     */
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let ultimoAncho = el.clientWidth;
        const vigia = new ResizeObserver(() => {
            const ancho = el.clientWidth;
            if (ancho === ultimoAncho) return;
            ultimoAncho = ancho;
            if (el.value.trim()) ajustar();
        });
        vigia.observe(el);
        return () => vigia.disconnect();
    }, [ref, ajustar, reiniciarCon]);
}

/* ────────────────────────── la zona de la izquierda ────────────────────── */

/**
 * El «+» y sus herramientas.
 *
 * Con sitio van **en fila**, como en Chats desde siempre; sin él se pliegan en
 * la columna flotante que sale del «+». Lo que cambia entre las dos barras es
 * QUÉ botones van dentro, y eso entra por `children`.
 *
 * `fijo` es lo que se queda fuera del menú cuando hay sitio —en Chats, el
 * interruptor de la IA y la firma— y desaparece al plegarse, porque esas dos
 * cosas viven entonces en la cabecera y dentro del propio menú.
 */
export function ZonaDeHerramientas(props: {
    compacta: boolean;
    abierta: boolean;
    alAlternar: () => void;
    deshabilitado?: boolean;
    fijo?: React.ReactNode;
    children: React.ReactNode;
    contenedorRef?: React.RefObject<HTMLDivElement>;
}) {
    const { compacta, abierta, alAlternar, deshabilitado, fijo, children, contenedorRef } = props;
    return (
        <div
            ref={contenedorRef}
            className="relative flex shrink-0 flex-nowrap items-center justify-center"
        >
            {fijo ? (
                <div className={cn("hidden pr-2 items-center gap-1", !compacta && "sm:flex")}>
                    {fijo}
                </div>
            ) : null}
            <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={alAlternar}
                disabled={deshabilitado}
                aria-expanded={abierta}
                aria-label={abierta ? "Cerrar las herramientas" : "Herramientas de mensaje"}
                className={cn(
                    BOTON_DE_HERRAMIENTA,
                    compacta ? "flex" : "sm:hidden",
                    abierta
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
            >
                {abierta ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
            <div
                className={cn(
                    "items-center gap-1",
                    abierta ? COLUMNA_DE_HERRAMIENTAS : compacta ? "hidden" : "hidden sm:flex",
                )}
            >
                {children}
            </div>
        </div>
    );
}

/* ─────────────────────────── la zona de la derecha ─────────────────────── */

/** Lo que hay que pasarle a un botón de la derecha para pintarlo. */
type Boton = {
    alPulsar: () => void;
    deshabilitado?: boolean;
    etiqueta: string;
    titulo?: string;
    icono: React.ReactNode;
    clase?: string;
    marcado?: boolean;
};

/**
 * Los botones redondos de dentro de la caja: dictado, nota de voz y enviar.
 *
 * **Cuáles salen lo decide `losBotonesDeLaDerecha`**, que es puro y está al
 * lado del `rellenoDeLaCaja` que le deja el hueco: si no salieran de la misma
 * lista, el día que se afine uno el otro se queda y el texto pasa por debajo
 * del botón o se corta contra un hueco vacío.
 */
export function BotonesDeLaDerecha(props: {
    compacta: boolean;
    conVoz: boolean;
    hayDictado: boolean;
    dictando: boolean;
    grabando: boolean;
    hayAlgoQueEnviar: boolean;
    /** Sin nota de voz: el copiloto solo dicta (ver `conNota` en `lib/barra-de-escribir`). */
    conNota?: boolean;
    dictado: Boton | null;
    /** Obligatorio salvo con `conNota={false}`, donde no se pinta nunca. */
    nota?: Boton | null;
    enviar: Boton;
    /** El menú del micrófono, en compacto, con el dictado y la nota dentro. */
    menuAbierto: boolean;
    alAlternarMenu: () => void;
    menuRef?: React.RefObject<HTMLDivElement>;
    menuDeshabilitado?: boolean;
}) {
    const {
        compacta,
        conVoz,
        hayDictado,
        dictando,
        grabando,
        hayAlgoQueEnviar,
        conNota,
        dictado,
        nota,
        enviar,
        menuAbierto,
        alAlternarMenu,
        menuRef,
        menuDeshabilitado,
    } = props;

    const cuales = losBotonesDeLaDerecha({
        compacta,
        conVoz,
        hayDictado,
        dictando,
        grabando,
        hayAlgoQueEnviar,
        conNota,
    });

    const pintar = (b: Boton, clave: string) => (
        <Button
            key={clave}
            type="button"
            size="icon"
            onClick={b.alPulsar}
            disabled={b.deshabilitado}
            aria-label={b.etiqueta}
            aria-pressed={b.marcado}
            title={b.titulo ?? b.etiqueta}
            className={cn(BOTON_REDONDO, b.clase ?? BOTON_REDONDO_EN_REPOSO)}
        >
            {b.icono}
        </Button>
    );

    const uno = (cual: BotonDeLaDerecha) => {
        if (cual === "dictado") return dictado ? pintar(dictado, "dictado") : null;
        if (cual === "nota") return nota ? pintar(nota, "nota") : null;
        if (cual === "enviar") return pintar(enviar, "enviar");
        return (
            <div className="relative" key="menu" ref={menuRef}>
                <Button
                    type="button"
                    size="icon"
                    onClick={alAlternarMenu}
                    disabled={menuDeshabilitado}
                    aria-expanded={menuAbierto}
                    aria-label="Voz: dictado o nota de voz"
                    title="Voz: dictado o nota de voz"
                    className={cn(
                        BOTON_REDONDO,
                        menuAbierto ? "bg-zinc-300 dark:bg-zinc-600" : BOTON_REDONDO_EN_REPOSO,
                    )}
                >
                    <Mic className="h-3.5 w-3.5 text-black dark:text-white" />
                </Button>
                {menuAbierto ? (
                    <div className={COLUMNA_DE_VOZ}>
                        {dictado ? pintar(dictado, "dictado-menu") : null}
                        {nota ? pintar(nota, "nota-menu") : null}
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <div className="absolute bottom-1.5 right-1.5 z-10 flex flex-row items-center gap-1">
            {cuales.map(uno)}
        </div>
    );
}

/**
 * El hueco que la caja tiene que dejarle a esos botones, con el MISMO estado.
 *
 * Se exporta aparte porque el `className` de la caja lo escribe cada pantalla
 * —una es ámbar en modo nota, la otra no— pero el número sale de aquí.
 */
export function rellenoParaLosBotones(estado: {
    compacta: boolean;
    conVoz: boolean;
    hayDictado: boolean;
    dictando: boolean;
    grabando: boolean;
    hayAlgoQueEnviar: boolean;
    conNota?: boolean;
}): string {
    return rellenoDeLaCaja(losBotonesDeLaDerecha(estado).length);
}
