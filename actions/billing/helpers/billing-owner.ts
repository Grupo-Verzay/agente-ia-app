import { db } from "@/lib/db";

/**
 * La facturacion que MANDA sobre una cuenta.
 *
 * Un asesor no tiene servicio propio: lo tiene su cuenta madre. Ya estaba
 * escrito en /api/payment/confirm -"renovarle a un asesor no activaria nada y
 * el pago quedaria aplicado donde no toca"- pero las pantallas que bloquean
 * miraban la ficha de quien iniciaba sesion, no la de su duenno.
 *
 * El resultado se vio en produccion: un reseller pago, su cuenta madre quedo
 * activa, y sus asesores siguieron viendo "Tu licencia vencio" con su propia
 * ficha vieja. No habia forma de arreglarlo pagando; habia que ir cuenta por
 * cuenta corriendo fechas a mano.
 *
 * Resolver el duenno aqui hace que suspender y reactivar vayan siempre juntos,
 * sin nada que propagar y sin fichas de asesor que se queden atras.
 */
export async function facturacionQueMandaEn(userId: string) {
    const cuenta = await db.user
        .findUnique({ where: { id: userId }, select: { ownerId: true } })
        .catch(() => null);

    // Sin duenno la cuenta responde por si misma, que es el caso de siempre.
    const responsable = cuenta?.ownerId ?? userId;

    const facturacion = await db.userBilling.findUnique({
        where: { userId: responsable },
    });

    // Un asesor cuya cuenta madre no tiene ficha no se bloquea: antes de este
    // cambio tampoco se bloqueaba por eso, y dejar fuera a un equipo entero por
    // una ficha que nadie creo seria peor que dejarlo entrar.
    return { facturacion, responsable, esDeLaMadre: responsable !== userId };
}
