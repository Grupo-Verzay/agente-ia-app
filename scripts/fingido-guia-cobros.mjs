/**
 * El servidor de WhatsApp Mensajería de la guía de Cobros, servido dentro de
 * `next start`.
 *
 * Cobros pregunta si la cuenta tiene una línea CONECTADA para mandar los
 * recordatorios (`laLineaDeLaCuenta` → `getWahaSession`), y sin ella pinta
 * «Esta cuenta no tiene una línea de WhatsApp conectada» encima de la cartera.
 * Este equipo no sale a internet y la guía no puede depender de una línea de
 * verdad, así que este fichero se carga ANTES que Next (`NODE_OPTIONS=--import`,
 * lo pone `generar-guia.sh` cuando existe `fingido-guia-<modulo>.mjs`, el mismo
 * mecanismo que el de Conexión y Ajustes) y contesta en su lugar: la línea de
 * ejemplo sale CONECTADA.
 *
 * Ni las capturas ni el vídeo mandan nada («Cobrar ahora» se señala y no se
 * pulsa); por si acaso, un envío se contesta bien y no sale de aquí.
 *
 * Solo toca el servidor de ejemplo (`SERVIDOR_DE_EJEMPLO`, el que siembra
 * `sembrar-guia-cobros.mjs`); cualquier otra dirección sigue su camino.
 */
export const SERVIDOR_DE_EJEMPLO = "https://waha.minegocio.co";
const NUMERO_DE_EJEMPLO = "573001234567";

const original = globalThis.fetch;
globalThis.fetch = async function fetchDeLaGuia(entrada, init) {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
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
    if (/^\/api\/send/.test(ruta)) return Response.json({ id: `guia-${Date.now()}` });
    return Response.json({});
};
