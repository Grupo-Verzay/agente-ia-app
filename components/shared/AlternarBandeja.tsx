"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, MessageCircle } from "lucide-react";
import { useModuleStore } from "@/stores/modules/useModuleStore";
import { BANDEJAS, laBandejaActiva, seVeLaBarritaDeBandejas } from "@/lib/alternar-bandejas";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const ICONO = { chats: MessageCircle, correo: Mail } as const;

/**
 * La barrita de arriba para pasar de Chats a Correos y de vuelta. Vive en la
 * barra de la plataforma (`Breadcrumbs`), que es la MISMA en las dos
 * pantallas, **anclada a la izquierda, justo después del botón del menú**:
 * así sale en el mismo píxel en las dos y en cualquier anchura.
 *
 * Centrada no se pudo: medido, a 1024 y a 1280 con el botón de tutoriales
 * puesto, el buscador de la derecha le pasa por encima. Y después de las migas
 * tampoco: «chats» y «correo» no miden lo mismo, y la barrita se correría al
 * cambiar de pantalla.
 *
 * Los dos botones tienen un ANCHO FIJO por lo mismo: con el suyo propio, la
 * activa (en negrita) ensancharía su mitad. En un teléfono se queda con los
 * iconos.
 *
 * Va dentro de la lista de migas, así que pinta su propio `<li>` y su
 * separador; fuera de las dos pantallas no pinta nada (ni la raya).
 *
 * Cuándo sale lo decide `seVeLaBarritaDeBandejas`: en esas dos pantallas y
 * solo si las dos están en el menú de quien mira.
 */
/** ¿Se pinta la barrita aquí? La barra lo pregunta para no partir las migas. */
export function useSeVeLaBarritaDeBandejas(): boolean {
    const pathname = usePathname();
    const modules = useModuleStore((s) => s.modules);
    const rutas = modules.flatMap((m) => [m.route, ...(m.moduleItems ?? []).map((i) => i.url)]);
    return seVeLaBarritaDeBandejas(pathname, rutas);
}

export function AlternarBandeja() {
    const pathname = usePathname();
    const seVe = useSeVeLaBarritaDeBandejas();
    if (!seVe) return null;
    const activa = laBandejaActiva(pathname);

    return (
        <li className="flex shrink-0 items-center gap-2">
        <nav
            data-alternar-bandeja
            aria-label="Cambiar entre Chats y Correos"
            className="flex h-7 shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/60 p-px"
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
                            "flex h-6 w-8 items-center justify-center gap-1.5 rounded-full text-xs transition-colors sm:w-[6.5rem]",
                            esLaActiva
                                ? "bg-background font-semibold text-primary shadow-sm"
                                : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Icono className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">{b.nombre}</span>
                    </Link>
                );
            })}
        </nav>
        <Separator orientation="vertical" className="mr-2 h-4" />
        </li>
    );
}
