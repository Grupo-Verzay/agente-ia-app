/**
 * ¿Se pinta la barra de pestañas del panel en esta ruta?
 *
 * La barra la pintan DOS sitios: el layout de `/panel` (con `excludePanelRoutes`
 * apagado) y el layout raíz para todo lo que es un apartado del panel pero
 * vive fuera de `/panel` —Embudos (`/embudos`), Proyectos, Diagramas,
 * Documentación (`/documentation`)…—. Por eso Documentación NO se muda a
 * `/panel/…`: ser «un módulo más del panel» no es una cuestión de ruta, es
 * que su dirección esté entre las pestañas. Mudarla rompería enlaces, las
 * guías y los apartados guardados en la base.
 *
 * **Ninguna pantalla que sea un apartado del panel se queda sin su barra.**
 * Hubo una lista de excepciones (`RUTAS_SIN_PESTANAS`, con `/documentation`
 * dentro) y es justo lo que dejaba Documentación sin barra mientras Embudos
 * la tenía: no se vuelve a escribir una.
 *
 * Se compara por SEGMENTO: `/documentation/guide` es de la pestaña
 * `/documentation`, `/documentationes` no.
 */
export type PestanaDelPanel = { url: string; locked?: boolean };

export function laRutaDeLaPestana(url: string): string {
    const i = url.indexOf("?");
    return i === -1 ? url : url.slice(0, i);
}

function esDeLaRuta(pathname: string, ruta: string): boolean {
    return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

export function seVeLaBarraDelPanel(
    pathname: string | null | undefined,
    tabs: PestanaDelPanel[],
    opts: { excludePanelRoutes?: boolean; panelRoutes?: string[] } = {},
): boolean {
    const ruta = String(pathname ?? "");
    const panelRoutes = opts.panelRoutes ?? ["/panel"];
    const enElPanel = panelRoutes.some((r) => esDeLaRuta(ruta, r));
    const esUnApartado = tabs.some((t) => esDeLaRuta(ruta, laRutaDeLaPestana(t.url)));
    if (opts.excludePanelRoutes) return esUnApartado && !enElPanel;
    return enElPanel || esUnApartado;
}
