"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CentroDeAyuda } from "@/components/ayuda/CentroDeAyuda";
import { GuiasDeLaCategoria } from "@/components/ayuda/GuiasDeLaCategoria";
import { GuiaEnLaLanding } from "@/components/guia/GuiaEnLaLanding";
import { laCategoria, lasGuiasDeLaCategoria, type GuiaDeAyuda } from "@/lib/centro-de-ayuda";
import { elAnclaDeLaVista, laVistaDelAncla, type VistaDeTutoriales } from "@/lib/tutoriales-de-la-landing";

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
 * - «Ver» abre la GUÍA aquí mismo (`#tutoriales/<categoria>/<modulo>`, y una
 *   sección `…/<modulo>/<seccion>`), con las mismas piezas que
 *   `/guia/<modulo>` (`GuiaEnLaLanding`): antes salía a esa página, con otro
 *   diseño y sin la barra de la landing. El buscador hace lo mismo.
 */
const PORTADA: VistaDeTutoriales = { categoria: null, modulo: null, seccion: null };

export function TutorialesDeLaLanding({ guias }: { guias: GuiaDeAyuda[] }) {
    const [vista, setVista] = useState<VistaDeTutoriales>(PORTADA);
    const caja = useRef<HTMLDivElement>(null);
    // El oyente del ancla se monta una vez y lee las guías por referencia.
    const lasGuias = useRef(guias);
    lasGuias.current = guias;

    // Lo que dice el ancla manda: al cargar y cada vez que cambia (el menú, o un
    // enlace a `#tutoriales/<categoria>/<guia>` estando ya en la landing).
    useEffect(() => {
        const leer = () => {
            const desdeElAncla = laVistaDelAncla(window.location.hash, lasGuias.current);
            if (desdeElAncla === undefined) return; // el ancla es de otra sección
            setVista(desdeElAncla);
            // Un ancla de categoría o de guía no es el id de ningún elemento:
            // el navegador no baja solo, así que se baja aquí.
            if (desdeElAncla.categoria) {
                requestAnimationFrame(() => caja.current?.scrollIntoView({ block: "start" }));
            }
        };
        leer();
        window.addEventListener("hashchange", leer);
        return () => window.removeEventListener("hashchange", leer);
    }, []);

    const irA = useCallback((nueva: VistaDeTutoriales) => {
        setVista(nueva);
        try {
            const url = `${window.location.pathname}${window.location.search}${elAnclaDeLaVista(nueva)}`;
            window.history.replaceState(window.history.state, "", url);
        } catch {
            // Sin historial (un marco con restricciones): la vista cambia igual.
        }
        // Cada vista mide distinto: quien bajó hasta el final de una guía no
        // puede quedarse mirando lo de debajo de la sección al cambiar.
        requestAnimationFrame(() => {
            const el = caja.current;
            if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
        });
    }, []);

    const categoria = vista.categoria ? laCategoria(vista.categoria) : null;
    const guia = categoria && vista.modulo ? guias.find((g) => g.modulo === vista.modulo) ?? null : null;
    const abrirGuia = (modulo: string, seccion: string | null = null) => {
        const g = guias.find((x) => x.modulo === modulo);
        if (g?.categoria) irA({ categoria: g.categoria, modulo, seccion });
    };

    return (
        <div
            ref={caja}
            className="dark scroll-mt-20"
            data-tutoriales-de-la-landing
            data-vista={guia ? `${categoria!.slug}/${guia.modulo}${vista.seccion ? `/${vista.seccion}` : ""}` : categoria ? categoria.slug : "portada"}
        >
            {categoria && guia ? (
                <GuiaEnLaLanding
                    guia={guia}
                    nombreDeLaCategoria={categoria.nombre}
                    seccion={vista.seccion}
                    alVolver={() => irA({ categoria: categoria.slug, modulo: null, seccion: null })}
                    alAbrirSeccion={(s) => irA({ categoria: categoria.slug, modulo: guia.modulo, seccion: s })}
                />
            ) : categoria ? (
                <GuiasDeLaCategoria
                    categoria={categoria}
                    guias={lasGuiasDeLaCategoria(guias, categoria.slug)}
                    alVolver={() => irA(PORTADA)}
                    alAbrirGuia={(m) => abrirGuia(m)}
                    incrustado
                />
            ) : (
                <CentroDeAyuda
                    guias={guias}
                    titulo="Tutoriales"
                    alElegirCategoria={(s) => irA({ categoria: s, modulo: null, seccion: null })}
                    alAbrirGuia={abrirGuia}
                    incrustado
                />
            )}
        </div>
    );
}
