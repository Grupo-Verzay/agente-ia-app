/**
 * El servidor de WhatsApp Mensajería de la guía de Conexión y Ajustes, servido
 * dentro de `next start`.
 *
 * La pestaña Conexión pregunta al servidor de Waha cómo está la línea
 * (`/api/waha/status/<linea>` → `getWahaSession`). Este equipo no sale a
 * internet, y la guía no puede depender de una línea de verdad, así que este
 * fichero se carga ANTES que Next (`NODE_OPTIONS=--import`, lo pone
 * `generar-guia.sh` cuando existe `fingido-guia-<modulo>.mjs`, el mismo
 * mecanismo que el Gemini fingido de AI Imágenes) y contesta en su lugar: la
 * línea de ejemplo sale CONECTADA, con un número de ejemplo.
 *
 * Lo mismo con el servidor de LLAMADAS (`LLAMADAS_DE_EJEMPLO`): sin
 * `ASTRACALLS_URL` la tarjeta «Llamadas WhatsApp» no se pinta, así que se pone
 * aquí —antes de que Next lea el entorno— y su sesión sale vinculada.
 *
 * Solo toca los servidores de ejemplo (`SERVIDOR_DE_EJEMPLO`, el que siembra
 * `sembrar-guia-conexion.mjs`); cualquier otra dirección sigue su camino tal
 * cual.
 */
export const SERVIDOR_DE_EJEMPLO = "https://waha.minegocio.co";
export const NUMERO_DE_EJEMPLO = "573001234567";
export const LLAMADAS_DE_EJEMPLO = "https://llamadas.minegocio.co";
/** La sesión de llamadas de la cuenta de ejemplo (`astraCallsSid`). */
export const SESION_DE_LLAMADAS = "guia-llamadas";

process.env.ASTRACALLS_URL ??= LLAMADAS_DE_EJEMPLO;
process.env.ASTRACALLS_API_KEY ??= "clave-de-ejemplo";

const original = globalThis.fetch;
globalThis.fetch = async function fetchDeLaGuia(entrada, init) {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
    if (url?.startsWith(LLAMADAS_DE_EJEMPLO)) {
        const ruta = url.slice(LLAMADAS_DE_EJEMPLO.length);
        if (ruta.startsWith("/api/sessions")) {
            return Response.json({
                sessions: [{ id: SESION_DE_LLAMADAS, name: "Mi Negocio", jid: `${NUMERO_DE_EJEMPLO}@s.whatsapp.net`, state: "open", paired: true }],
            });
        }
        return Response.json({});
    }
    if (!url || !url.startsWith(SERVIDOR_DE_EJEMPLO)) return original(entrada, init);
    const ruta = url.slice(SERVIDOR_DE_EJEMPLO.length);
    const sesion = /^\/api\/sessions\/([^/?]+)$/.exec(ruta);
    if (sesion && (!init?.method || init.method === "GET")) {
        return Response.json({
            name: decodeURIComponent(sesion[1]),
            status: "WORKING",
            me: { id: `${NUMERO_DE_EJEMPLO}@c.us`, pushName: "Mi Negocio" },
            config: { webhooks: [] },
        });
    }
    // Lo demás (eventos, foto de perfil) no hace falta en la guía: se contesta
    // vacío y bien, como un servidor que no tiene nada que añadir.
    return Response.json({});
};
