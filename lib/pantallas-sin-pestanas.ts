/**
 * Las pantallas que NO llevan la barra de pestañas del panel encima.
 *
 * Las de Documentación —la portada, Guías, Tutoriales, Actualizaciones y la
 * conexión con Meta— tienen su propio título y su flecha de regreso, así que
 * la barra del panel encima solo enseñaba pestañas de otros módulos y le
 * quitaba su alto a la pantalla. El título ya dice dónde se está.
 *
 * Se compara por SEGMENTO, no por prefijo: `/documentationes` no es
 * Documentación.
 */
export const RUTAS_SIN_PESTANAS = ["/documentation"] as const;

export function escondeLasPestanas(pathname: string | null | undefined): boolean {
    const ruta = String(pathname ?? "");
    return RUTAS_SIN_PESTANAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));
}
