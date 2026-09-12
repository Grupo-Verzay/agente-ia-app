/**
 * Qué dijo Evolution de verdad cuando algo le sale mal.
 *
 * Evolution **no pone el motivo donde uno lo busca**. Un rechazo suyo viene así:
 *
 * ```json
 * { "status": 403, "error": "Forbidden",
 *   "response": { "message": ["This name \"X\" is already in use."] } }
 * ```
 *
 * O sea que `raw.message` —que es lo que leía quien la llamaba— viene **vacío**,
 * y el aviso se quedaba en el texto por defecto: «Error al crear la instancia en
 * la API». Desde fuera eso es un botón que falla y no dice por qué, que es
 * justo lo que este proyecto tiene prohibido por escrito.
 *
 * Se mira en tres sitios y por ese orden, porque Evolution no siempre usa el
 * mismo: el anidado, el de arriba, y por último el cuerpo entero. Aquí vale más
 * acertar con el aviso que ser purista.
 *
 * Es puro: entra la respuesta y sale una cadena. No sabe de red ni de pantallas.
 */
export function motivoDeEvolution(raw: unknown): string {
    const cuerpo = raw as { message?: unknown; response?: { message?: unknown }; error?: unknown };

    const anidado = cuerpo?.response?.message;
    if (Array.isArray(anidado) && anidado.length) return anidado.map(String).join(", ");
    if (typeof anidado === "string" && anidado.trim()) return anidado.trim();

    const arriba = cuerpo?.message;
    if (Array.isArray(arriba) && arriba.length) return arriba.map(String).join(", ");
    if (typeof arriba === "string" && arriba.trim()) return arriba.trim();

    if (typeof cuerpo?.error === "string" && cuerpo.error.trim()) return cuerpo.error.trim();

    return "";
}

/** El nombre ya está cogido en el servidor. */
const YA_EXISTE = /already in use|already exists|ya est[áa] en uso/i;

/**
 * Por qué no se pudo crear la línea, en palabras que se puedan usar.
 *
 * El caso que se repite es el del nombre ocupado, y tiene una explicación
 * concreta: la línea existe en el servidor de WhatsApp pero **no tiene ficha en
 * la App** —se borró la ficha y no la sesión, o se creó por fuera—. Decir
 * «Error al crear la instancia» ahí no ayuda a nadie; decir que el nombre ya
 * está cogido sí, porque apunta a lo que hay que hacer.
 */
export function motivoDeNoPoderCrearLaLinea(raw: unknown, porDefecto: string): string {
    const motivo = motivoDeEvolution(raw);
    if (!motivo) return porDefecto;
    if (YA_EXISTE.test(motivo)) {
        return (
            "Ese nombre ya está en uso en el servidor: la línea existe allí pero no tiene ficha en la App. " +
            "No se creó ninguna. Avísanos para recuperarla sin perder su historial."
        );
    }
    return motivo;
}
