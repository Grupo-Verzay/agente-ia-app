/**
 * El puntico de color y la palabra corta con que se dice de qué línea —o de qué
 * cuenta— es una fila: «● Ventas», «● Atención».
 *
 * Nació en la lista de Chats (`ChatContactItem`), escrito ahí dentro. Se sacó
 * aquí cuando CRM › Llamadas lo necesitó en su columna Nombre: con una copia en
 * cada pantalla, el día que se afine la paleta o el recorte se afina en una y
 * la misma cuenta sale de un color en Chats y de otro en Llamadas — que es
 * justo lo que el color viene a evitar. **Una sola función decide el color y
 * una sola la palabra.**
 *
 * Puro: ni React ni nada del navegador, para poder probarlo sin levantar nada.
 */

/** La paleta de Chats, tal cual estaba. Cambiarla cambia los dos sitios a la vez. */
export const COLORES_DE_LINEA = [
    "bg-violet-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-amber-500",
] as const;

/**
 * El color de una línea. **La llave es el nombre CRUDO de la línea**
 * (`instanceName`, p. ej. `VERZAY_VENTAS`), que es con lo que Chats lo pinta:
 * con otra llave —el nombre bonito, la cuenta— la misma línea saldría de otro
 * color en cada pantalla.
 *
 * El hash es el de siempre (`h * 31 + c`, a 16 bits); no se toca, o todas las
 * líneas cambiarían de color de golpe el día del despliegue.
 */
export function colorDeLaLinea(clave: string | null | undefined): string {
    const s = clave ?? "";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return COLORES_DE_LINEA[h % COLORES_DE_LINEA.length];
}

/**
 * La palabra corta: lo que va detrás de la última barra («Verzay | Ventas» →
 * «Ventas»), o el último trozo de un nombre técnico («VERZAY_ATENCION» →
 * «ATENCION»). Sin el sufijo de canal (`_wh`, `_tg`, `_fb`, `_ig`).
 */
export function palabraCortaDeLaLinea(nombre: string | null | undefined): string {
    const clean = (nombre ?? "").replace(/_(wh|tg|fb|ig)$/i, "").trim();
    const pipeParts = clean.split("|").map((part) => part.trim()).filter(Boolean);
    if (pipeParts.length > 1) return pipeParts[pipeParts.length - 1];

    const parts = clean.split(/[_\s-]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];

    return clean;
}
