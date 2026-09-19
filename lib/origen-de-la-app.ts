/**
 * El origen con el que se está sirviendo esta petición.
 *
 * Lo usan las dos pantallas que enlazan texto —el chat de equipo y Chats— para
 * decidir **qué dirección es de dentro**: una de dentro navega sin recargar y
 * una de fuera abre una pestaña. Con el dominio equivocado, un enlace propio se
 * trataría como ajeno y sacaría a alguien de la plataforma.
 *
 * Se lee de la **petición** y no de una variable de entorno: la App se abre por
 * más de un dominio —el de producción y el que cada quien tenga delante— y una
 * variable solo sabe de uno. Es el mismo criterio con el que se compone el
 * enlace de una reunión.
 *
 * **Es de servidor**, aunque no lleve `server-only` —ese paquete no está
 * instalado en este repo y añadir una dependencia para una guarda no entra en
 * el encargo—. La guarda de verdad es la forma: `next/headers` solo existe en
 * el servidor, así que en el navegador esto devuelve el respaldo y nunca el
 * dominio de delante. Y no puede leerse de `window.location`: daría una salida
 * al pintar en el servidor y otra en el navegador, o sea una hidratación rota.
 */
export async function elOrigenDeLaApp(): Promise<string> {
    try {
        const { headers } = await import("next/headers");
        const h = await headers();
        const host = h.get("x-forwarded-host") || h.get("host");
        if (host) {
            const proto = h.get("x-forwarded-proto") || "https";
            return `${proto}://${host}`;
        }
    } catch {
        // Fuera de una petición no hay cabeceras; se usa el respaldo.
    }
    return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}
