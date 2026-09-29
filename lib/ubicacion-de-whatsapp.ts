/**
 * La UBICACIÓN que comparte un contacto por WhatsApp, leída venga de donde venga.
 *
 * **Este fichero está COPIADO BYTE A BYTE en los dos repositorios**: aquí y en
 * `api-webhook/src/modules/webhook/utils/ubicacion-de-whatsapp.ts`. El backend
 * lo usa para TRADUCIR lo que llega por Waha, Meta y Telegram a la forma de
 * Evolution, y la App para LEERLA y pintar la tarjeta del mapa. Si las dos
 * copias discreparan, el backend guardaría una forma que la App no sabe leer y
 * la ubicación volvería a salir como un mensaje vacío. Los dos bancos las
 * comparan: si se toca una, se copia a la otra.
 *
 * Por qué hacía falta, medido en producción el 2026-09-29:
 *
 * - **Evolution** la guardaba bien —`locationMessage` con `degreesLatitude` y
 *   `degreesLongitude`, 62 en dos meses— y la App la pintaba como
 *   «[Mensaje locationMessage]»: sin mapa y sin forma de abrirla.
 * - **Waha** la TIRABA: el normalizador solo sabía de texto y adjuntos, así que
 *   una ubicación («[Waha] Mensaje sin contenido soportado ignorado») no llegaba
 *   ni a la base. La trae en `location` y en `_data.Message.locationMessage`.
 * - **Meta** (Cloud API) y **Telegram** igual: `type: 'location'` y
 *   `message.location` caían en «tipo no soportado».
 *
 * La forma común es la de Evolution —`locationMessage` / `liveLocationMessage`
 * con `degreesLatitude`, `degreesLongitude`, `name`, `address` y `url`—, que es
 * la que ya existía guardada: así lo de antes y lo de ahora se leen igual.
 *
 * Puro y sin importar nada, para que se pueda copiar tal cual y probar sin red.
 */

/** Los dos tipos de WhatsApp que llevan una ubicación. */
export const TIPOS_DE_UBICACION = ["locationMessage", "liveLocationMessage"] as const;
export type TipoDeUbicacion = (typeof TIPOS_DE_UBICACION)[number];

/** Lo que se guarda en `message[tipo]`: la forma de Evolution/Baileys. */
export type UbicacionDeWhatsapp = {
    degreesLatitude: number;
    degreesLongitude: number;
    name?: string;
    address?: string;
    url?: string;
};

/** Lo que se pinta: la ubicación ya leída. */
export type Ubicacion = {
    latitud: number;
    longitud: number;
    nombre: string | null;
    direccion: string | null;
    enVivo: boolean;
};

/** La etiqueta de texto: la lista de chats, la exportación, el aviso de la bandeja. */
export const ETIQUETA_DE_UBICACION: Record<TipoDeUbicacion, string> = {
    locationMessage: "[Ubicación]",
    liveLocationMessage: "[Ubicación en vivo]",
};

export function esTipoDeUbicacion(tipo: unknown): tipo is TipoDeUbicacion {
    return tipo === "locationMessage" || tipo === "liveLocationMessage";
}

/**
 * Un número de verdad. Waha manda las coordenadas como CADENA ("8.8301119") y
 * Evolution como número; `Number("")` y `Number(null)` son 0, y un 0 aquí es un
 * punto real del golfo de Guinea, así que lo vacío se descarta a mano antes.
 */
function comoNumero(valor: unknown): number | null {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (typeof valor === "string" && valor.trim() !== "") {
        const n = Number(valor.trim());
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Texto limpio y acotado, o nada. Lo escribe alguien de fuera. */
function comoTexto(valor: unknown, tope = 200): string | undefined {
    if (typeof valor !== "string") return undefined;
    const limpio = valor.replace(/\s+/g, " ").trim();
    return limpio ? limpio.slice(0, tope) : undefined;
}

/**
 * Un par de coordenadas que existe en la Tierra, o `null`.
 *
 * `0, 0` se rechaza a propósito: es lo que sale de un campo que llegó vacío y
 * se convirtió a número por el camino, no una ubicación que alguien compartió.
 */
export function comoCoordenadas(lat: unknown, lng: unknown): { latitud: number; longitud: number } | null {
    const latitud = comoNumero(lat);
    const longitud = comoNumero(lng);
    if (latitud === null || longitud === null) return null;
    if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) return null;
    if (latitud === 0 && longitud === 0) return null;
    return { latitud, longitud };
}

/**
 * La forma que se guarda. Sin la miniatura (`JPEGThumbnail`, ~3 kB de base64):
 * el mapa se pinta con las coordenadas y ese peso no lo lee nadie.
 */
function comoUbicacionDeWhatsapp(
    coordenadas: { latitud: number; longitud: number },
    extra: { nombre?: unknown; direccion?: unknown; url?: unknown },
): UbicacionDeWhatsapp {
    const name = comoTexto(extra.nombre);
    const address = comoTexto(extra.direccion, 300);
    const url = comoTexto(extra.url, 500);
    return {
        degreesLatitude: coordenadas.latitud,
        degreesLongitude: coordenadas.longitud,
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
        ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
    };
}

export type UbicacionTraducida = { tipo: TipoDeUbicacion; datos: UbicacionDeWhatsapp };

/**
 * La ubicación de un mensaje de WAHA, o `null` si no es una ubicación.
 *
 * Waha la manda por dos sitios y se miran los dos (medido con un mensaje real
 * del motor GOWS): `location` —`{ live, latitude, longitude, name?, address?,
 * url?, description? }`, con las coordenadas en CADENA— y el mensaje de
 * WhatsApp crudo en `_data.Message.locationMessage` (o `liveLocationMessage`).
 */
export function ubicacionDeWaha(msg: unknown): UbicacionTraducida | null {
    if (!msg || typeof msg !== "object") return null;
    const m = msg as Record<string, any>;

    const loc = m.location;
    if (loc && typeof loc === "object") {
        const c = comoCoordenadas(loc.latitude, loc.longitude);
        if (c) {
            return {
                tipo: loc.live === true ? "liveLocationMessage" : "locationMessage",
                datos: comoUbicacionDeWhatsapp(c, {
                    nombre: loc.name ?? loc.description,
                    direccion: loc.address,
                    url: loc.url,
                }),
            };
        }
    }

    const crudo = m._data?.Message ?? m._data?.RawMessage ?? m._data?.message;
    if (crudo && typeof crudo === "object") {
        for (const tipo of TIPOS_DE_UBICACION) {
            const l = (crudo as Record<string, any>)[tipo];
            if (!l || typeof l !== "object") continue;
            const c = comoCoordenadas(l.degreesLatitude, l.degreesLongitude);
            if (c) {
                return {
                    tipo,
                    datos: comoUbicacionDeWhatsapp(c, { nombre: l.name ?? l.caption, direccion: l.address, url: l.url }),
                };
            }
        }
    }
    return null;
}

/** La ubicación de un mensaje de la Cloud API de Meta (`type: 'location'`). */
export function ubicacionDeMeta(location: unknown): UbicacionTraducida | null {
    if (!location || typeof location !== "object") return null;
    const l = location as Record<string, any>;
    const c = comoCoordenadas(l.latitude, l.longitude);
    if (!c) return null;
    return {
        tipo: "locationMessage",
        datos: comoUbicacionDeWhatsapp(c, { nombre: l.name, direccion: l.address, url: l.url }),
    };
}

/**
 * La ubicación de un mensaje de Telegram: `venue` (un sitio con nombre) o
 * `location` a secas. `live_period` es una ubicación en vivo.
 */
export function ubicacionDeTelegram(msg: unknown): UbicacionTraducida | null {
    if (!msg || typeof msg !== "object") return null;
    const m = msg as Record<string, any>;
    const venue = m.venue && typeof m.venue === "object" ? m.venue : null;
    const loc = venue?.location ?? m.location;
    if (!loc || typeof loc !== "object") return null;
    const c = comoCoordenadas(loc.latitude, loc.longitude);
    if (!c) return null;
    return {
        tipo: !venue && Number(loc.live_period) > 0 ? "liveLocationMessage" : "locationMessage",
        datos: comoUbicacionDeWhatsapp(c, { nombre: venue?.title, direccion: venue?.address }),
    };
}

/**
 * La ubicación que lleva un `message` ya guardado (la forma de Evolution), o
 * `null`. Es lo que lee la burbuja, la exportación y la lista.
 */
export function laUbicacionDelMensaje(message: unknown): Ubicacion | null {
    if (!message || typeof message !== "object") return null;
    for (const tipo of TIPOS_DE_UBICACION) {
        const l = (message as Record<string, any>)[tipo];
        if (!l || typeof l !== "object") continue;
        const c = comoCoordenadas(l.degreesLatitude, l.degreesLongitude);
        if (!c) continue;
        return {
            latitud: c.latitud,
            longitud: c.longitud,
            nombre: comoTexto(l.name) ?? comoTexto(l.caption) ?? null,
            direccion: comoTexto(l.address, 300) ?? null,
            enVivo: tipo === "liveLocationMessage",
        };
    }
    return null;
}

/**
 * Las coordenadas como se leen: seis decimales (unos 10 cm), que es lo que
 * enseña WhatsApp. Con coma decimal o con punto se lee distinto en cada país;
 * aquí van con punto porque es lo que se pega en cualquier buscador de mapas.
 */
export function lasCoordenadasEnTexto(u: { latitud: number; longitud: number }): string {
    return `${u.latitud.toFixed(6)}, ${u.longitud.toFixed(6)}`;
}

/**
 * El enlace que abre el punto en un mapa. Se ARMA con las coordenadas, nunca
 * con el `url` que venga en el mensaje: ese lo escribió alguien de fuera, y
 * poner un enlace ajeno detrás de un mapa sería llevar a donde él quiera.
 */
export function elEnlaceDelMapa(u: { latitud: number; longitud: number }): string {
    return `https://www.google.com/maps/search/?api=1&query=${u.latitud.toFixed(6)},${u.longitud.toFixed(6)}`;
}

/**
 * La ubicación como TEXTO: lo que se copia al portapapeles y lo que sale al
 * reenviarla. Nombre, dirección y el enlace del mapa, cada uno en su línea; el
 * enlace siempre, que es lo que de verdad lleva a alguien al sitio.
 */
export function laUbicacionEnTexto(u: Ubicacion): string {
    const titulo = u.nombre || (u.enVivo ? "Ubicación en vivo" : "Ubicación");
    return [`📍 ${titulo}`, u.direccion, elEnlaceDelMapa(u)].filter(Boolean).join("\n");
}
