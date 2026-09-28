"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { useModuleStore } from "@/stores/modules/useModuleStore";
import {
    BANDEJAS,
    dondeVaElSelector,
    HUECO_DE_LA_BARRA_PX,
    laBandejaActiva,
    seVeLaBarritaDeBandejas,
} from "@/lib/alternar-bandejas";
import { MARCA_DE_LA_COLUMNA } from "@/hooks/usePanelFlotante";
import { cn } from "@/lib/utils";

const ICONO = { chats: MessageCircle, correo: Mail } as const;

/** Hueco entre el selector y lo que tiene a cada lado: el MISMO que hay
 *  entre la casita y el menú (`gap-2` en la barra). */
const HUECO_PX = HUECO_DE_LA_BARRA_PX;

/**
 * El selector de la barra de arriba para pasar de Chats a Correos y de vuelta.
 * Sale en TODAS las pantallas (si la persona tiene las dos en su menú) y marca
 * la que se está mirando; fuera de las dos no marca ninguna.
 *
 * Va **centrado en la columna de la lista de conversaciones**, no en la barra:
 * se mide esa columna (`data-columna-de-chats`, la llevan Chats y Correos) y,
 * donde no la hay, la columna que habría —`--ancho-lateral` desde el borde
 * izquierdo del contenido—. Así sale en el mismo píxel en todas las pantallas.
 * Dónde exactamente, cuánto mide y si cabe con sus palabras o solo con los
 * iconos, lo decide `dondeVaElSelector`, que es pura: arranca a un hueco del
 * menú —el mismo que hay entre la casita y el menú— y se estira hasta que su
 * centro cae en el de la columna. Mide lo que los botones de la derecha
 * (`h-9`), no menos.
 *
 * Es `absolute` dentro de la barra (que es `relative`): así no empuja nada y la
 * casita y el menú no se mueven.
 */
export function useSeVeLaBarritaDeBandejas(): boolean {
    const modules = useModuleStore((s) => s.modules);
    const rutas = modules.flatMap((m) => [m.route, ...(m.moduleItems ?? []).map((i) => i.url)]);
    return seVeLaBarritaDeBandejas(rutas);
}

/** La columna visible de la lista, o `null` si en esta pantalla no hay. */
function laColumnaVisible(): DOMRect | null {
    for (const el of Array.from(document.querySelectorAll(`[${MARCA_DE_LA_COLUMNA}]`))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return r;
    }
    return null;
}

export function AlternarBandeja({
    barra,
    izquierda,
    derecha,
}: {
    barra: RefObject<HTMLElement>;
    izquierda: RefObject<HTMLElement>;
    derecha: RefObject<HTMLElement>;
}) {
    const pathname = usePathname();
    const seVe = useSeVeLaBarritaDeBandejas();
    const activa = laBandejaActiva(pathname);
    const sonda = useRef<HTMLDivElement>(null);
    const [sitio, setSitio] = useState<{ izquierda: number; ancho: number; compacto: boolean } | null>(null);

    const medir = useCallback(() => {
        const b = barra.current?.getBoundingClientRect();
        const i = izquierda.current?.getBoundingClientRect();
        const d = derecha.current?.getBoundingClientRect();
        if (!b || !i || !d || b.width === 0) return;

        let columna = laColumnaVisible();
        if (!columna) {
            // Sin columna: la que habría, desde el borde del contenido.
            // Por dentro de su borde, que es donde empieza la columna de verdad.
            const el = document.querySelector<HTMLElement>("[data-caja-del-contenido]");
            const caja = el?.getBoundingClientRect();
            const hay = !!(el && caja && caja.width > 0);
            const desde = hay ? caja!.left + el!.clientLeft : b.left;
            const hasta = hay ? desde + el!.clientWidth : b.right;
            const ancho = Math.min(sonda.current?.getBoundingClientRect().width || hasta - desde, hasta - desde);
            columna = new DOMRect(desde, 0, ancho, 0);
        }
        const siguiente = dondeVaElSelector({
            columna: { izquierda: columna.left - b.left, ancho: columna.width },
            minimo: i.right - b.left + HUECO_PX,
            maximo: d.left - b.left - HUECO_PX,
        });
        setSitio((antes) =>
            antes &&
            antes.izquierda === siguiente.izquierda &&
            antes.ancho === siguiente.ancho &&
            antes.compacto === siguiente.compacto
                ? antes
                : { izquierda: siguiente.izquierda, ancho: siguiente.ancho, compacto: siguiente.compacto },
        );
    }, [barra, izquierda, derecha]);

    useLayoutEffect(() => {
        if (seVe) medir();
    }, [seVe, pathname, medir]);

    useEffect(() => {
        if (!seVe) return;
        let cuadro = 0;
        const pedir = () => {
            cancelAnimationFrame(cuadro);
            cuadro = requestAnimationFrame(medir);
        };
        // La columna de la pantalla puede montarse un poco después de la ruta.
        const plazos = [60, 250, 800, 2000].map((ms) => setTimeout(pedir, ms));
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(pedir) : null;
        for (const el of [barra.current, izquierda.current, derecha.current]) if (el && ro) ro.observe(el);
        for (const el of Array.from(document.querySelectorAll(`[${MARCA_DE_LA_COLUMNA}], [data-caja-del-contenido]`)))
            ro?.observe(el);
        window.addEventListener("resize", pedir);
        return () => {
            cancelAnimationFrame(cuadro);
            plazos.forEach(clearTimeout);
            ro?.disconnect();
            window.removeEventListener("resize", pedir);
        };
    }, [seVe, pathname, medir, barra, izquierda, derecha]);

    if (!seVe) return null;
    const compacto = sitio?.compacto ?? true;

    return (
        <>
            {/* La columna que habría: `--ancho-lateral`, invisible. */}
            <div ref={sonda} aria-hidden className="pointer-events-none invisible absolute h-0 w-[var(--ancho-lateral)]" />
            <nav
                data-alternar-bandeja
                data-compacto={compacto ? "" : undefined}
                aria-label="Cambiar entre Chats y Correos"
                style={{ left: sitio?.izquierda ?? 0, width: sitio?.ancho, visibility: sitio ? "visible" : "hidden" }}
                className="absolute top-1/2 flex h-9 -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-muted/60 p-px"
            >
                {BANDEJAS.map((b) => {
                    const Icono = ICONO[b.clave];
                    const esLaActiva = activa === b.clave;
                    return (
                        <Link
                            key={b.clave}
                            href={b.ruta}
                            data-bandeja={b.clave}
                            aria-current={esLaActiva ? "page" : undefined}
                            title={b.nombre}
                            className={cn(
                                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] px-1.5 text-sm transition-colors",
                                esLaActiva
                                    ? "bg-background font-semibold text-primary shadow-sm"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icono className="h-4 w-4 shrink-0" />
                            {!compacto && <span className="whitespace-nowrap">{b.nombre}</span>}
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
