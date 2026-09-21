/**
 * El logo que se enseña en la puerta de una reunión.
 *
 * Es la MISMA fuente que la pantalla de agendar: el `image` de la cuenta dueña
 * de la reunión (`User.image`), no un campo aparte. Agendar hace
 * `user.image || FALLBACK`; aquí el respaldo no es otra imagen sino el icono de
 * cámara de siempre, así que la regla se reduce a «¿hay un logo usable?»: un
 * `image` vacío, con solo espacios o nulo devuelve `null` y la puerta cae al
 * icono, que es lo que pedía el encargo.
 *
 * Es puro para poder probar esa regla —«sin logo, icono»— sin levantar nada, y
 * para que el servidor (`elLogoDeLaCuenta`) y cualquier otro sitio decidan lo
 * mismo y no discrepen.
 */
export function elLogoQueSeMuestra(image: string | null | undefined): string | null {
    const limpio = (image ?? "").trim();
    return limpio ? limpio : null;
}
