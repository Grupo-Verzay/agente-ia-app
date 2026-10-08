"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Home, Mail, MessageCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { resolveModuleItemDest } from "@/lib/canva-embed";
import { useModuleStore } from "@/stores/modules/useModuleStore";
import {
    BANDEJAS,
    dondeVaElSelector,
    HUECO_DE_LA_BARRA_PX,
    laBandejaActiva,
    lasBandejasQueSeVen,
    seVeLaBarritaDeBandejas,
    type SinLeerDeLasBandejas,
} from "@/lib/alternar-bandejas";
import { CLASE_DEL_CONTADOR, elTextoDelContador } from "@/lib/pendientes-del-menu";
import { useChatsQueEsperan } from "@/stores/useChatUnreadStore";
import { useCorreosSinLeerStore } from "@/stores/useCorreosSinLeerStore";
import { CADA_CUANTO_SE_CUENTA_EL_CORREO_MS } from "@/hooks/usePendientesDelMenu";
import { MARCA_DE_LA_COLUMNA } from "@/hooks/usePanelFlotante";
import { esVarianteDePanel } from "@/lib/sidebar-modules";
import { cn } from "@/lib/utils";

const ICONO = { chats: MessageCircle, correo: Mail, llamadas: Phone } as const;

/** Hueco entre el selector y lo que tiene a cada lado: el MISMO que hay
 *  entre los botones de la derecha (`gap-2` en la barra). */
const HUECO_PX = HUECO_DE_LA_BARRA_PX;
/** La casita del Panel: un cuadrado del alto de la barra, como los de la derecha. */
const CASITA_PX = 36;

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
 * menú —el mismo que hay entre los botones de la derecha— y se estira hasta
 * que su centro cae en el de la columna. Mide lo que los botones de la derecha
 * (`h-9`), no menos.
 *
 * Cada pestaña lleva sus SIN LEER, con el mismo número y la misma forma que el
 * menú lateral: Chats de la bandeja (`useChatsQueEsperan`) y Correos del store
 * compartido con el menú, así la pregunta al proveedor sale una vez.
 *
 * Es `absolute` dentro de la barra (que es `relative`): así no empuja nada y el
 * menú no se mueve.
 *
 * Y a su derecha, a un hueco, va la CASITA que lleva al Panel (el que le toque
 * a la persona: `esVarianteDePanel`). Su sitio se le RESERVA al selector antes
 * de medirlo (se le quita a `maximo`), así Chats y Correos siguen en su
 * posición y con su ancho, centrados en la columna; solo donde no cabe (un
 * teléfono) el selector cede, como ya cedía. Va aquí y no como un botón más de
 * la barra: es parte del mismo grupo de accesos.
 */
export function useSeVeLaBarritaDeBandejas(): boolean {
    const modules = useModuleStore((s) => s.modules);
    const rutas = modules.flatMap((m) => [m.route, ...(m.moduleItems ?? []).map((i) => i.url)]);
    return seVeLaBarritaDeBandejas(rutas);
}

/**
 * Los sin leer de las dos. Correos se pide aquí también —en un teléfono el menú
 * lateral no está montado mientras está cerrado—, pero al store compartido:
 * si el menú ya preguntó hace poco, no se vuelve a preguntar.
 */
function useSinLeerDeLasBandejas(activo: boolean): SinLeerDeLasBandejas {
    const chats = useChatsQueEsperan();
    const correo = useCorreosSinLeerStore((s) => s.sinLeer);
    const pedir = useCorreosSinLeerStore((s) => s.pedirSiHaceFalta);
    useEffect(() => {
        if (!activo) return;
        const edad = CADA_CUANTO_SE_CUENTA_EL_CORREO_MS / 2;
        void pedir(edad);
        const reloj = setInterval(() => { if (!document.hidden) void pedir(edad); }, CADA_CUANTO_SE_CUENTA_EL_CORREO_MS);
        const alVolver = () => { if (!document.hidden) void pedir(edad); };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            clearInterval(reloj);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [activo, pedir]);
    return { chats, correo };
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
    const router = useRouter();
    const setLabelModule = useModuleStore((s) => s.setLabelModule);
    const modulosDelMenu = useModuleStore((s) => s.modules);
    const bandejas = useMemo(
        () => lasBandejasQueSeVen(modulosDelMenu.flatMap((m) => [m.route, ...(m.moduleItems ?? []).map((i) => i.url)])),
        [modulosDelMenu],
    );
    const panel = useModuleStore((s) => s.modules.find((m) => esVarianteDePanel(m.route)) ?? null);
    const conCasita = !!panel;
    const activo = seVe || conCasita;
    const activa = laBandejaActiva(pathname);
    const sinLeer = useSinLeerDeLasBandejas(seVe);
    const sonda = useRef<HTMLDivElement>(null);
    const [sitio, setSitio] = useState<{ izquierda: number; ancho: number; compacto: boolean } | null>(null);
    const [inicio, setInicio] = useState<number | null>(null);

    const medir = useCallback(() => {
        const b = barra.current?.getBoundingClientRect();
        const i = izquierda.current?.getBoundingClientRect();
        const d = derecha.current?.getBoundingClientRect();
        if (!b || !i || !d || b.width === 0) return;
        const minimo = i.right - b.left + HUECO_PX;
        setInicio((antes) => (antes === Math.round(minimo) ? antes : Math.round(minimo)));

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
            // La casita va justo tras el menú; el selector arranca después de ella.
            minimo: minimo + (conCasita ? CASITA_PX + HUECO_PX : 0),
            maximo: d.left - b.left - HUECO_PX,
            cuantas: bandejas.length,
        });
        setSitio((antes) =>
            antes &&
            antes.izquierda === siguiente.izquierda &&
            antes.ancho === siguiente.ancho &&
            antes.compacto === siguiente.compacto
                ? antes
                : { izquierda: siguiente.izquierda, ancho: siguiente.ancho, compacto: siguiente.compacto },
        );
    }, [barra, izquierda, derecha, conCasita, bandejas.length]);

    useLayoutEffect(() => {
        if (activo) medir();
    }, [activo, pathname, medir]);

    useEffect(() => {
        if (!activo) return;
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
    }, [activo, pathname, medir, barra, izquierda, derecha]);

    if (!activo) return null;
    const compacto = sitio?.compacto ?? true;
    const enElPanel = !!panel && (pathname === panel.route || !!pathname?.startsWith(panel.route + "/"));
    const izquierdaDeLaCasita = inicio;

    return (
        <>
            {panel && (
                <Link
                    href={panel.route}
                    onClick={(e) => {
                        // Igual que el icono del menú lateral: mismo destino y misma etiqueta.
                        e.preventDefault();
                        const sub = (panel.moduleItems ?? [])[0];
                        const destino = sub?.url ? sub.url.replace("/admin/", "/panel/") : panel.route;
                        setLabelModule(panel.label);
                        router.push(resolveModuleItemDest(destino, sub?.customUrl));
                    }}
                    data-boton-del-panel
                    title="Panel"
                    aria-label="Ir al Panel"
                    aria-current={enElPanel ? "page" : undefined}
                    style={{
                        left: izquierdaDeLaCasita ?? 0,
                        visibility: izquierdaDeLaCasita === null ? "hidden" : "visible",
                    }}
                    className={cn(
                        "absolute top-1/2 flex h-9 w-9 shrink-0 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-background shadow-sm transition-colors",
                        enElPanel ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    <Home className="h-4 w-4" />
                </Link>
            )}
            {/* La columna que habría: `--ancho-lateral`, invisible. */}
            <div ref={sonda} aria-hidden className="pointer-events-none invisible absolute h-0 w-[var(--ancho-lateral)]" />
            {seVe && (<nav
                data-alternar-bandeja
                data-compacto={compacto ? "" : undefined}
                aria-label="Cambiar entre Chats, Correos y Llamadas"
                style={{ left: sitio?.izquierda ?? 0, width: sitio?.ancho, visibility: sitio ? "visible" : "hidden" }}
                className="absolute top-1/2 flex h-9 -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-muted/60 p-px"
            >
                {bandejas.map((b) => {
                    const Icono = ICONO[b.clave];
                    const esLaActiva = activa === b.clave;
                    const numero = elTextoDelContador(b.ruta, sinLeer);
                    return (
                        <Link
                            key={b.clave}
                            href={b.ruta}
                            data-bandeja={b.clave}
                            aria-current={esLaActiva ? "page" : undefined}
                            title={numero ? `${b.nombre} · ${numero} sin leer` : b.nombre}
                            className={cn(
                                "relative flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] px-1.5 text-sm transition-colors",
                                esLaActiva
                                    ? "bg-background font-semibold text-primary shadow-sm"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icono className="h-4 w-4 shrink-0" />
                            {!compacto && <span className="whitespace-nowrap">{b.nombre}</span>}
                            {/* Con sus palabras, el número va detrás; solo con
                                el icono, en su esquina, para no ensanchar la
                                pestaña en un teléfono. */}
                            {numero && (
                                <span
                                    data-sin-leer={b.clave}
                                    className={cn(CLASE_DEL_CONTADOR, compacto ? "absolute right-0 top-0" : "ml-0.5")}
                                >
                                    {numero}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>)}
        </>
    );
}
