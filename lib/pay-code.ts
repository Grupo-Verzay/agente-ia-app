import { randomInt } from "crypto";

import { db } from "@/lib/db";

/**
 * Enlace de pago corto y propio de cada cliente: agente.ia-app.com/p/K7M2QX.
 *
 * Por que uno por cliente y no uno por plan: el enlace es lo unico que le dice
 * a Wompi de quien es el pago. Con un enlace por plan llegan quince pagos de
 * 179.000 iguales y no hay forma de saber a que cuenta renovarle -que es
 * exactamente lo que pasaba antes, y por eso un pago real no activo nada-.
 */

/**
 * Sin O/0, I/1/l ni U. Los tres primeros pares se confunden al leerlos en voz
 * alta o al copiarlos de una pantalla; la U sale por lo de siempre, para que el
 * azar no arme una palabrota en un codigo que el cliente va a ver.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const LARGO = 6;

function codigoAlAzar(): string {
    let salida = "";
    // randomInt y no Math.random: un codigo adivinable dejaria abrir el enlace
    // de pago de otro cliente, con su nombre y su precio dentro.
    for (let i = 0; i < LARGO; i++) salida += ALFABETO[randomInt(ALFABETO.length)];
    return salida;
}

/**
 * Devuelve el codigo del cliente, creandolo la primera vez que se pide.
 *
 * No se genera al crear la cuenta porque hay cuentas viejas que nunca pasaron
 * por ahi; generarlo cuando se necesita las cubre a todas sin migrar nada.
 */
export async function obtenerPayCode(userId: string): Promise<string | null> {
    const actual = await db.userBilling.findUnique({
        where: { userId },
        select: { payCode: true },
    });
    if (!actual) return null;
    if (actual.payCode) return actual.payCode;

    // El codigo es unico en la base. Con 30^6 combinaciones el choque es raro,
    // pero "raro" no es "nunca": si dos clientes lo piden a la vez y sale el
    // mismo, se reintenta en vez de dejar a uno sin enlace.
    for (let intento = 0; intento < 8; intento++) {
        const candidato = codigoAlAzar();
        try {
            const guardado = await db.userBilling.update({
                where: { userId },
                data: { payCode: candidato },
                select: { payCode: true },
            });
            return guardado.payCode;
        } catch {
            const yaTiene = await db.userBilling.findUnique({
                where: { userId },
                select: { payCode: true },
            });
            // Otra llamada simultanea gano la carrera: su codigo sirve igual.
            if (yaTiene?.payCode) return yaTiene.payCode;
        }
    }

    console.error(`[pay-code] No se pudo generar un código para ${userId}.`);
    return null;
}

/** La direccion publica del enlace, o null si no hay dominio configurado. */
export function urlDePago(payCode: string): string | null {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!base) return null;
    return `${base.replace(/\/+$/, "")}/p/${payCode}`;
}

/** El enlace listo para pegar en la ficha del cliente o mandar por chat. */
export async function enlaceDePagoDe(userId: string): Promise<string | null> {
    const codigo = await obtenerPayCode(userId);
    return codigo ? urlDePago(codigo) : null;
}
