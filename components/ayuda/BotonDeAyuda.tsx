"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RUTA_DEL_CENTRO_DE_AYUDA } from "@/lib/centro-de-ayuda";

/**
 * «Ayuda», en la barra de arriba, justo antes de «Soporte»: lleva al centro de
 * ayuda (`/ayuda`), con todas las guías de la plataforma por categoría.
 *
 * No sustituye a «Ver tutoriales», que sigue enseñando la guía de la pantalla
 * en la que se está: aquel es «cómo se usa esto», y este es «¿dónde aprendo lo
 * que busco?», esté donde esté.
 *
 * El MISMO aspecto que «Soporte» —borde y texto del color primario, la palabra
 * solo desde `sm`—: son los dos botones de pedir ayuda y se leen como pareja.
 * Sale siempre, también dentro del centro de ayuda (ahí se pinta puesto): es la
 * forma de volver a las categorías desde una de ellas.
 */
export function BotonDeAyuda() {
    const ruta = usePathname() ?? "/";
    const aqui = ruta === RUTA_DEL_CENTRO_DE_AYUDA || ruta.startsWith(`${RUTA_DEL_CENTRO_DE_AYUDA}/`);
    return (
        <Button
            asChild
            variant="ghost"
            size="sm"
            className={`h-9 gap-1.5 border border-primary/30 text-primary hover:bg-primary/10 hover:text-primary${aqui ? " bg-primary/10" : ""}`}
        >
            <Link
                href={RUTA_DEL_CENTRO_DE_AYUDA}
                title="Centro de ayuda"
                aria-label="Centro de ayuda"
                aria-current={aqui ? "page" : undefined}
                data-boton-de-ayuda
            >
                <CircleHelp className="h-5 w-5" aria-hidden />
                <span className="hidden sm:inline">Ayuda</span>
            </Link>
        </Button>
    );
}
