import { db } from "@/lib/db";

/**
 * La facturacion que MANDA sobre una cuenta.
 *
 * Regla del negocio: una cuenta que cuelga de otra no responde por su propia
 * ficha, responde por la de arriba. Si el reseller esta vencido se vencen todas
 * las suyas; si se activa, se activan todas.
 *
 * Hay dos formas de colgar, y se encadenan -un asesor, de un cliente, de un
 * reseller son dos saltos-:
 *
 * 1. UN ASESOR no tiene servicio propio: lo tiene su cuenta madre (`ownerId`).
 *    Ya estaba escrito en /api/payment/confirm -"renovarle a un asesor no
 *    activaria nada y el pago quedaria aplicado donde no toca"- pero las
 *    pantallas que bloquean miraban la ficha de quien iniciaba sesion.
 *
 * 2. UN CLIENTE DE UN RESELLER no paga a la plataforma: le paga al reseller, y
 *    el reseller paga aqui. Su ficha propia es un resto que nadie renueva, asi
 *    que aparecia vencida y le apagaba el agente aunque el reseller estuviera
 *    al dia.
 *
 * El caso 2 llega por dos caminos porque conviven dos formas de enlazar un
 * cliente a su reseller: `demoResellerId` (la actual, con bolsa de licencias) y
 * la tabla `Reseller` (la antigua). Se miran las dos: dejar fuera la antigua
 * seria arreglar a unos clientes y a otros no, sin ningun motivo visible.
 */

/** Tope de saltos. Un asesor de un cliente de un reseller son dos; el tercero
 *  es margen. Con un tope, un dato mal enlazado no cuelga la pantalla. */
const SALTOS_MAXIMOS = 3;

/** De quien cuelga esta cuenta, o null si no cuelga de nadie. */
async function deQuienCuelga(userId: string): Promise<string | null> {
    const cuenta = await db.user
        .findUnique({
            where: { id: userId },
            select: { ownerId: true, demoResellerId: true },
        })
        .catch(() => null);
    if (!cuenta) return null;

    if (cuenta.ownerId) return cuenta.ownerId;
    if (cuenta.demoResellerId) return cuenta.demoResellerId;

    // Enlace antiguo. Se consulta solo cuando los dos de arriba estan vacios,
    // que es el caso de las cuentas que no cuelgan de nadie.
    const antiguo = await db.reseller
        .findFirst({ where: { userId }, select: { resellerid: true } })
        .catch(() => null);
    return antiguo?.resellerid ?? null;
}

export async function facturacionQueMandaEn(userId: string) {
    let responsable = userId;
    const vistos = new Set<string>([userId]);

    for (let salto = 0; salto < SALTOS_MAXIMOS; salto++) {
        const arriba = await deQuienCuelga(responsable);
        // Sin nadie por encima, esta cuenta responde por si misma.
        if (!arriba) break;
        // Un enlace circular no puede dejar la pantalla dando vueltas.
        if (vistos.has(arriba)) break;

        vistos.add(arriba);
        responsable = arriba;
    }

    const facturacion = await db.userBilling.findUnique({
        where: { userId: responsable },
    });

    // Sin ficha no se bloquea. Antes de esto tampoco se bloqueaba por eso, y
    // dejar fuera a un equipo entero por una ficha que nadie creo seria peor
    // que dejarlo entrar.
    return { facturacion, responsable, heredada: responsable !== userId };
}
