/**
 * El TIEMPO REAL del vídeo de ventas: el mismo aviso `chat:changed` que en
 * producción manda el backend por socket.io en cuanto el webhook guarda un
 * mensaje, servido desde Playwright.
 *
 * Sin esto, el panel del vídeo solo se enteraría de un mensaje por sus relojes
 * de respaldo —5 s el chat abierto, 20 s la lista, y 10 s de caché de la
 * bandeja en el servidor—, que es lo que ve una cuenta con el socket caído y
 * NO lo que ve un cliente. Con el aviso, el mensaje sale en la lista y en la
 * conversación al instante, por el mismo camino (`useChatsRealtime`).
 *
 * Es el protocolo de socket.io v4 sobre el transporte de SONDEO (engine.io
 * v4), que es por donde el cliente de la App empieza siempre
 * (`transports: ["polling", "websocket"]`). Se ofrece sin mejoras
 * (`upgrades: []`), así que el cliente se queda en sondeo y no hace falta
 * ningún servidor de WebSocket. La App no nota la diferencia: pide su token a
 * `/api/realtime/token` como siempre (con `REALTIME_URL` apuntando a su propio
 * origen) y se conecta a `/socket.io/`, que intercepta Playwright.
 */

const SEPARADOR = "\x1e";

/**
 * Cuánto espera el cliente un ping antes de dar la conexión por muerta.
 *
 * Una semana, y no los 20 s de un servidor de verdad, por el RELOJ DE LA
 * HISTORIA: el vídeo salta horas —del mensaje al seguimiento, y de ahí al día
 * del recordatorio— con `clock.setSystemTime`, y engine.io comprueba su plazo
 * contra `Date.now()` (`_hasPingExpired`). Con el plazo normal, cada salto
 * cerraba la conexión por «ping timeout» y el panel se reconectaba: el aviso
 * que caía en ese segundo no le llegaba a nadie, y el mensaje salía en el
 * celular y no en el panel. Los pings se siguen mandando cada 20 s reales.
 */
export const PLAZO_DEL_PING_MS = 7 * 24 * 60 * 60 * 1000;

/** El paquete de apertura de engine.io, como lo manda un servidor v4. */
export function laApertura(sid, { pingInterval = 25_000, pingTimeout = PLAZO_DEL_PING_MS } = {}) {
    return "0" + JSON.stringify({ sid, upgrades: [], pingInterval, pingTimeout, maxPayload: 1_000_000 });
}

/** Un evento de socket.io dentro de un mensaje de engine.io (`4` + `2`). */
export const elEvento = (nombre, datos) => `42${JSON.stringify([nombre, datos])}`;

/** Lo que el cliente mandó en un POST de sondeo, paquete a paquete. */
export const losPaquetes = (cuerpo) => String(cuerpo ?? "").split(SEPARADOR).filter(Boolean);

/**
 * Monta el servidor en el contexto de Playwright. Devuelve `emitir`, que
 * entrega un evento a todas las pestañas conectadas, y `conectadas`, para
 * esperar a que el panel esté escuchando antes de que llegue nada.
 */
export async function servirElTiempoReal(contexto, { intervaloDePing = 20_000 } = {}) {
    const sesiones = new Map();
    let siguiente = 0;

    const empujar = (s, paquete) => {
        s.cola.push(paquete);
        const despertar = s.despertar;
        s.despertar = null;
        despertar?.();
    };

    const contestar = (route, cuerpo, tipo = "text/plain; charset=UTF-8") =>
        route.fulfill({ status: 200, contentType: tipo, body: cuerpo }).catch(() => {});

    await contexto.route(/\/socket\.io\/\?/, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const sid = url.searchParams.get("sid");

        if (!sid) {
            const id = `ventas-${++siguiente}`;
            sesiones.set(id, { cola: [], despertar: null, conectada: false });
            return contestar(route, laApertura(id));
        }
        const s = sesiones.get(sid);
        if (!s) {
            return route
                .fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: 1, message: "Session ID unknown" }) })
                .catch(() => {});
        }

        if (req.method() === "POST") {
            for (const paquete of losPaquetes(req.postData())) {
                // `40` = conectarse al espacio por defecto (con el token en su
                // cuerpo). Se acepta sin mirarlo: el token lo firmó la App con
                // su secreto y aquí no hay nada que proteger.
                if (paquete.startsWith("40")) {
                    s.conectada = true;
                    empujar(s, `40${JSON.stringify({ sid: `s-${sid}` })}`);
                } else if (paquete === "1" || paquete.startsWith("41")) {
                    s.conectada = false;
                }
                // `3` es el pong: no hay nada que hacer con él.
            }
            return contestar(route, "ok", "text/html");
        }

        // El sondeo largo: se queda abierto hasta que haya algo que entregar,
        // o hasta el ping, que es lo que mantiene viva la conexión.
        if (s.cola.length === 0) {
            await new Promise((listo) => {
                const ping = setTimeout(() => {
                    s.cola.push("2");
                    s.despertar = null;
                    listo();
                }, intervaloDePing);
                s.despertar = () => {
                    clearTimeout(ping);
                    listo();
                };
            });
        }
        return contestar(route, s.cola.splice(0).join(SEPARADOR));
    });

    return {
        emitir(nombre, datos) {
            let entregado = 0;
            for (const s of sesiones.values()) {
                if (!s.conectada) continue;
                empujar(s, elEvento(nombre, datos));
                entregado += 1;
            }
            return entregado;
        },
        conectadas: () => [...sesiones.values()].filter((s) => s.conectada).length,
    };
}
