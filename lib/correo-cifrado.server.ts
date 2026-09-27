import "server-only";

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";

/**
 * Las credenciales de un buzón —el refresh_token de Google o Microsoft, o la
 * contraseña de un correo de dominio propio— **nunca se guardan en claro**.
 *
 * # Sin variable nueva
 *
 * La llave sale de `AUTH_SECRET` (la de next-auth, que ya está en el stack) con
 * HKDF y un contexto propio, así que no es la misma llave con la que se firman
 * las sesiones. Una variable nueva sería una más que perder en el próximo
 * re-pegado del stack en Portainer, que es exactamente como se cayeron otras.
 *
 * Lo que cuesta, y se dice: **si `AUTH_SECRET` cambia, los buzones no se
 * pueden descifrar** y hay que volver a conectarlos. `abrir` devuelve `null`
 * en vez de lanzar, y la bandeja lo enseña como «vuelve a conectar este
 * correo», que es lo único que se puede hacer.
 */
function laLlave(uso: "credenciales" | "estado"): Buffer {
    const secreto = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secreto) throw new Error("Falta AUTH_SECRET: sin ella no se pueden guardar credenciales de correo.");
    return Buffer.from(hkdfSync("sha256", secreto, "verzay-correo", uso, 32));
}

/** AES-256-GCM: `v1.<iv>.<etiqueta>.<cifrado>`, todo en base64url. */
export function sellar(datos: unknown): string {
    const iv = randomBytes(12);
    const cifrador = createCipheriv("aes-256-gcm", laLlave("credenciales"), iv);
    const cifrado = Buffer.concat([cifrador.update(JSON.stringify(datos), "utf8"), cifrador.final()]);
    const etiqueta = cifrador.getAuthTag();
    return ["v1", iv.toString("base64url"), etiqueta.toString("base64url"), cifrado.toString("base64url")].join(".");
}

export function abrir<T>(sellado: string | null | undefined): T | null {
    try {
        const [version, iv, etiqueta, cifrado] = String(sellado ?? "").split(".");
        if (version !== "v1" || !iv || !etiqueta || !cifrado) return null;
        const descifrador = createDecipheriv("aes-256-gcm", laLlave("credenciales"), Buffer.from(iv, "base64url"));
        descifrador.setAuthTag(Buffer.from(etiqueta, "base64url"));
        const claro = Buffer.concat([descifrador.update(Buffer.from(cifrado, "base64url")), descifrador.final()]);
        return JSON.parse(claro.toString("utf8")) as T;
    } catch {
        return null;
    }
}

/* ── El `state` del viaje de autorización ─────────────────────────────────── */

export interface EstadoDeAutorizacion {
    personaId: string;
    cuentaId: string;
    proveedor: string;
    /** Va también en una cookie: el `state` solo vale en el navegador que lo pidió. */
    nonce: string;
    exp: number;
}

/**
 * El `state` va FIRMADO y con caducidad (diez minutos). Sin firma, quien
 * construyera la vuelta a mano con el `personaId` de otro le colgaría a esa
 * persona un buzón que no es suyo. Y sin el nonce en una cookie, un enlace de
 * vuelta robado serviría desde otro navegador.
 */
export function firmarElEstado(estado: EstadoDeAutorizacion): string {
    const cuerpo = Buffer.from(JSON.stringify(estado)).toString("base64url");
    const firma = createHmac("sha256", laLlave("estado")).update(cuerpo).digest("base64url");
    return `${cuerpo}.${firma}`;
}

export function leerElEstado(valor: string | null | undefined, ahora = Date.now()): EstadoDeAutorizacion | null {
    const [cuerpo, firma] = String(valor ?? "").split(".");
    if (!cuerpo || !firma) return null;
    const esperada = createHmac("sha256", laLlave("estado")).update(cuerpo).digest();
    const recibida = Buffer.from(firma, "base64url");
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
    try {
        const estado = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as EstadoDeAutorizacion;
        if (!estado?.personaId || !estado?.nonce || !(estado.exp > ahora)) return null;
        return estado;
    } catch {
        return null;
    }
}

export function unNonce(): string {
    return randomBytes(18).toString("base64url");
}
