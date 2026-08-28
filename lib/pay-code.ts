import { createHmac } from "crypto";

import { db } from "@/lib/db";

/**
 * Enlace de pago corto y propio de cada cliente: agente.ia-app.com/p/K7M2QX.
 *
 * Por que uno por cliente y no uno por plan: el enlace es lo unico que le dice
 * a Wompi de quien es el pago. Con un enlace por plan llegan quince pagos de
 * 179.000 iguales y no hay forma de saber a que cuenta renovarle -que es
 * exactamente lo que pasaba antes, y por eso un pago real no activo nada-.
 *
 * POR QUE EL CODIGO NO SE GUARDA EN LA BASE
 *
 * Lo natural seria una columna `payCode`, pero el esquema de esta base lo
 * gobierna el repo del backend (api-webhook) y este servicio no aplica
 * migraciones -ver docs/db-migrations-ownership.md-. Una columna declarada
 * aqui pero ausente en la base no falla al desplegar: falla en caliente, en
 * cada consulta que no liste columnas, y se lleva por delante el panel de
 * facturacion entero.
 *
 * Asi que el codigo se DERIVA del identificador del cliente. No ocupa nada, no
 * necesita migracion, y sale igual en cada llamada.
 */

/**
 * Sin O/0, I/1/l ni U. Los tres primeros pares se confunden al leerlos en voz
 * alta o al copiarlos de una pantalla; la U sale por lo de siempre, para que el
 * azar no arme una palabrota en un codigo que el cliente va a ver.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const LARGO = 6;

/**
 * El secreto es lo que impide fabricar el codigo de otro cliente.
 *
 * Sin el, cualquiera que conozca un identificador arma el enlace de pago de esa
 * cuenta -con su nombre y su precio dentro-. Se reusa AUTH_SECRET, que en esta
 * App siempre esta puesto; si algun dia se rota, los enlaces cambian y los
 * viejos dejan de abrir, que es justo lo que debe pasar.
 */
function secreto(): string | null {
    return process.env.AUTH_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null;
}

/** El codigo de un cliente. Siempre el mismo para el mismo identificador. */
export function codigoDe(userId: string): string | null {
    const clave = secreto();
    if (!clave) return null;

    const huella = createHmac("sha256", clave).update(`pago:${userId}`).digest();
    let salida = "";
    for (let i = 0; i < LARGO; i++) salida += ALFABETO[huella[i] % ALFABETO.length];
    return salida;
}

/**
 * A que cliente pertenece un codigo.
 *
 * Se recorren los clientes y se compara: la huella no se puede deshacer. Se
 * traen solo los identificadores -una columna, sin texto ni decimales- y el
 * calculo es un HMAC por fila, de microsegundos. Con los cientos de cuentas que
 * maneja esta plataforma no se nota; si algun dia fueran cientos de miles,
 * tocaria la columna `payCode` en api-webhook y este recorrido sobraria.
 */
export async function clientePorCodigo(codigo: string): Promise<string | null> {
    const buscado = codigo.trim().toUpperCase();
    if (buscado.length !== LARGO) return null;
    if (!secreto()) return null;

    const cuentas = await db.userBilling.findMany({ select: { userId: true } });

    const encontrados = cuentas.filter((c) => codigoDe(c.userId) === buscado);
    // Dos cuentas con el mismo codigo es practicamente imposible -729 millones
    // de combinaciones- pero si pasara, cobrarle al que salga primero seria
    // aplicarle el pago a quien no era. Mejor que no abra y quede en el registro.
    if (encontrados.length !== 1) {
        if (encontrados.length > 1) console.error(`[pay-code] Código repetido: ${buscado}.`);
        return null;
    }

    return encontrados[0].userId;
}

/** La direccion publica del enlace, o null si no hay dominio configurado. */
export function urlDePago(codigo: string): string | null {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!base) return null;
    return `${base.replace(/\/+$/, "")}/p/${codigo}`;
}

/** El enlace listo para pegar en la ficha del cliente o mandar por chat. */
export async function enlaceDePagoDe(userId: string): Promise<string | null> {
    const existe = await db.userBilling.findUnique({
        where: { userId },
        select: { userId: true },
    });
    if (!existe) return null;

    const codigo = codigoDe(userId);
    return codigo ? urlDePago(codigo) : null;
}
