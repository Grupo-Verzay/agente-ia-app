"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CentroDeAyuda } from "@/components/ayuda/CentroDeAyuda";
import { GuiasDeLaCategoria } from "@/components/ayuda/GuiasDeLaCategoria";
import { laCategoria, lasGuiasDeLaCategoria, type GuiaDeAyuda } from "@/lib/centro-de-ayuda";
import {
    ANCLA_DE_TUTORIALES,
    elAnclaDeLaCategoria,
    laCategoriaDelAncla,
} from "@/lib/tutoriales-de-la-landing";

/**
 * Los tutoriales DENTRO de la landing (`/inicio#tutoriales`), como sección
 * anclada al lado de Preguntas frecuentes.
 *
 * NO es una copia del centro de ayuda: pinta los mismos componentes
 * (`CentroDeAyuda`, `GuiasDeLaCategoria`) con las mismas guías
 * (`lasGuiasDelCentroDeAyuda`, que baja del servidor), así que una guía que se
 * publica sale aquí y en `/ayuda` a la vez. Lo único propio es que elegir una
 * categoría o volver CAMBIA DE VISTA en la misma página: antes era una página
 * aparte (`/tutoriales`) que sacaba al visitante de la landing.
 *
 * - La vista se refleja en el ancla (`#tutoriales/<categoria>`) con
 *   `replaceState`, sin mover la página: un enlace a una categoría abre la
 *   landing con esa categoría puesta, y la entrada «Tutoriales» del menú
 *   (`#tutoriales`) vuelve a las categorías.
 * - Va bajo la clase `dark`: los componentes son los del panel y con ella
 *   toman los colores oscuros de la landing en vez de tarjetas blancas.
 * - Las guías siguen abriendo en otra pestaña (`/guia/<modulo>`), así que la
 *   landing nunca se pierde.
 */
export function TutorialesDeLaLanding({ guias }: { guias: GuiaDeAyuda[] }) {
    const [slug, setSlug] = useState<string | null>(null);
    const caja = useRef<HTMLDivElement>(null);

    // Lo que dice el ancla manda: al cargar y cada vez que cambia (el menú, o un
    // enlace a `#tutoriales/<categoria>` estando ya en la landing).
    useEffect(() => {
        const leer = (desplazar: boolean) => {
            const desdeElAncla = laCategoriaDelAncla(window.location.hash);
            if (desdeElAncla === undefined) return; // el ancla es de otra sección
            setSlug(desdeElAncla);
            if (desplazar && desdeElAncla) {
                requestAnimationFrame(() => caja.current?.scrollIntoView({ block: "start" }));
            }
        };
        leer(true);
        // Un ancla de categoría no es el id de ningún elemento: el navegador no
        // baja solo, así que se baja aquí también al cambiar sin recargar.
        const alCambiar = () => leer(true);
        window.addEventListener("hashchange", alCambiar);
        return () => window.removeEventListener("hashchange", alCambiar);
    }, []);

    const irA = useCallback((nuevo: string | null) => {
        setSlug(nuevo);
        try {
            const url = `${window.location.pathname}${window.location.search}${nuevo ? elAnclaDeLaCategoria(nuevo) : `#${ANCLA_DE_TUTORIALES}`}`;
            window.history.replaceState(window.history.state, "", url);
        } catch {
            // Sin historial (un marco con restricciones): la vista cambia igual.
        }
        // La lista de una categoría es más corta que las diez tarjetas: sin
        // esto, quien bajó hasta la última se quedaría mirando lo de debajo.
        requestAnimationFrame(() => {
            const el = caja.current;
            if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
        });
    }, []);

    const categoria = slug ? laCategoria(slug) : null;

    return (
        <div ref={caja} className="dark scroll-mt-20" data-tutoriales-de-la-landing data-vista={categoria ? categoria.slug : "portada"}>
            {categoria ? (
                <GuiasDeLaCategoria
                    categoria={categoria}
                    guias={lasGuiasDeLaCategoria(guias, categoria.slug)}
                    alVolver={() => irA(null)}
                    incrustado
                />
            ) : (
                <CentroDeAyuda guias={guias} titulo="Tutoriales" alElegirCategoria={(s) => irA(s)} incrustado />
            )}
        </div>
    );
}
