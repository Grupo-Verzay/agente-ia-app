import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

import { confirmPaymentInternal } from "@/actions/billing/billing-payment-internal";
import { extractClientUserIdFromReference } from "@/lib/wompi-link";

/**
 * Receptor de eventos de Wompi.
 *
 * Esta es la pieza que faltaba para que un pago active la cuenta solo. El
 * enlace ya se generaba con el cliente dentro de la referencia
 * (crearEnlacePagoRenovacion) y la renovación ya estaba escrita
 * (confirmPaymentInternal); lo que no existía era una puerta por la que Wompi
 * pudiera avisar.
 *
 * Por qué no sirve /api/payment/confirm: esa ruta pide CRON_SECRET en la
 * cabecera, y Wompi no manda cabeceras nuestras -manda su propia firma-. Todo
 * evento que llegara allí se respondía con 401 y el pago se perdía en silencio.
 */

// Wompi reintenta ante cualquier respuesta que no sea 2xx. Por eso aquí un 200
// significa "recibido, no me vuelvas a mandar esto", y se usa también para los
// eventos que descartamos a propósito: reintentar un pago rechazado, o de un
// cliente que no existe, nunca va a salir bien. El 500 queda para los fallos
// pasajeros -la base caída-, que son los únicos donde el reintento ayuda.
function recibido(detalle: string, extra?: Record<string, unknown>) {
    return NextResponse.json({ success: true, message: detalle, ...extra }, { status: 200 });
}

/** Lee "transaction.amount_in_cents" dentro del objeto de datos del evento. */
function leerRuta(objeto: unknown, ruta: string): unknown {
    return ruta.split(".").reduce<unknown>((actual, tramo) => {
        if (actual && typeof actual === "object") return (actual as Record<string, unknown>)[tramo];
        return undefined;
    }, objeto);
}

/**
 * Firma de Wompi: SHA256 de los valores que el propio evento enumera en
 * signature.properties, en ese orden, mas el timestamp y el secreto de eventos.
 *
 * Los campos a concatenar los dicta el evento y no se fijan aquí a proposito:
 * Wompi ha cambiado esa lista antes, y leerla del evento evita que un cambio
 * suyo nos deje rechazando pagos buenos.
 */
function firmaValida(cuerpo: Record<string, unknown>, secreto: string): boolean {
    const firma = cuerpo.signature;
    if (!firma || typeof firma !== "object") return false;

    const { properties, checksum } = firma as { properties?: unknown; checksum?: unknown };
    if (!Array.isArray(properties) || properties.length === 0) return false;
    if (typeof checksum !== "string" || checksum.length === 0) return false;

    let cadena = "";
    for (const propiedad of properties) {
        if (typeof propiedad !== "string") return false;
        const valor = leerRuta(cuerpo.data, propiedad);
        // Un campo que el evento dice firmar pero no trae significa que la
        // cadena que armemos no va a coincidir nunca: mejor rechazar que
        // concatenar "undefined" y dar por bueno lo que no lo es.
        if (valor === undefined || valor === null) return false;
        cadena += String(valor);
    }
    cadena += String(cuerpo.timestamp ?? "");
    cadena += secreto;

    const calculado = createHash("sha256").update(cadena).digest("hex");
    const recibidoHex = checksum.toLowerCase();
    if (calculado.length !== recibidoHex.length) return false;
    // Comparación de tiempo constante: una comparación normal filtra, por lo
    // que tarda en fallar, cuántos caracteres del principio acertó quien la
    // intenta, y con eso se puede adivinar una firma a pedazos.
    return timingSafeEqual(Buffer.from(calculado), Buffer.from(recibidoHex));
}

export async function POST(request: Request) {
    const secreto = process.env.WOMPI_EVENTS_SECRET?.trim();
    if (!secreto) {
        console.error("[wompi] WOMPI_EVENTS_SECRET no está configurado; el evento se descarta.");
        return NextResponse.json(
            { success: false, message: "Pagos en línea no configurados." },
            { status: 500 }
        );
    }

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = await request.json();
        if (!crudo || typeof crudo !== "object") throw new Error("no es un objeto");
        cuerpo = crudo as Record<string, unknown>;
    } catch {
        return NextResponse.json({ success: false, message: "JSON inválido." }, { status: 400 });
    }

    if (!firmaValida(cuerpo, secreto)) {
        console.error("[wompi] Firma inválida; evento rechazado.");
        return NextResponse.json({ success: false, message: "Firma inválida." }, { status: 401 });
    }

    // A partir de aquí el evento está verificado: viene de Wompi.

    if (cuerpo.event !== "transaction.updated") {
        return recibido(`Evento ignorado: ${String(cuerpo.event)}.`);
    }

    const transaccion = leerRuta(cuerpo.data, "transaction");
    if (!transaccion || typeof transaccion !== "object") {
        return recibido("El evento no trae transacción.");
    }

    const t = transaccion as Record<string, unknown>;
    const estado = typeof t.status === "string" ? t.status : "";
    const idTransaccion = typeof t.id === "string" ? t.id : String(t.id ?? "");
    const referencia = typeof t.reference === "string" ? t.reference.trim() : "";

    // Wompi avisa de todos los cambios de estado. Solo APPROVED es plata que
    // entró; PENDING, DECLINED, VOIDED y ERROR no renuevan nada.
    if (estado !== "APPROVED") {
        return recibido(`Transacción en estado ${estado || "desconocido"}; no renueva.`);
    }

    if (!idTransaccion) {
        return recibido("La transacción no trae identificador.");
    }

    // El cliente sale de la referencia que la App metió en el enlace. Un pago
    // con otra referencia -un cobro hecho a mano desde el panel de Wompi, o de
    // otro producto- no sabemos a quién renovarle, y adivinar sería peor.
    const clientUserId = referencia ? extractClientUserIdFromReference(referencia) : null;
    if (!clientUserId) {
        console.warn(`[wompi] Transacción ${idTransaccion} con referencia ajena: "${referencia}".`);
        return recibido("La referencia del pago no identifica ninguna cuenta.");
    }

    const centavos = Number(t.amount_in_cents);
    if (!Number.isFinite(centavos) || centavos <= 0) {
        return recibido("La transacción no trae un monto válido.");
    }

    const moneda =
        typeof t.currency === "string" && /^[A-Z]{3}$/.test(t.currency.trim().toUpperCase())
            ? t.currency.trim().toUpperCase()
            : "COP";

    const medio = typeof t.payment_method_type === "string" ? t.payment_method_type : "desconocido";

    try {
        const resultado = await confirmPaymentInternal({
            clientUserId,
            // Wompi cobra en centavos; la renovación razona en unidades de la
            // moneda, que es como está guardado el precio del cliente.
            amount: centavos / 100,
            currencyCode: moneda,
            source: "WOMPI_WEBHOOK",
            // Se deduplica por la transacción y no por la referencia: si Wompi
            // reenvía el mismo evento -lo hace ante cualquier respuesta que no
            // sea 2xx-, la cuenta se renueva una sola vez.
            externalReference: `wompi-${idTransaccion}`,
            notes: `Wompi ${medio} · ref ${referencia}`,
        });

        if (!resultado.success) {
            // Reintentar no lo va a arreglar: el cliente no existe, o el monto
            // no cuadra con lo que se le factura. Queda en el registro para
            // poder resolverlo a mano.
            console.error(
                `[wompi] Transacción ${idTransaccion} verificada pero NO aplicada: ${resultado.message}`
            );
            return recibido(resultado.message, { applied: false });
        }

        console.info(
            `[wompi] Transacción ${idTransaccion} aplicada a ${clientUserId}` +
                (resultado.alreadyProcessed ? " (ya estaba)." : `; vence ${resultado.newDueDate}.`)
        );
        return recibido(resultado.message, {
            applied: true,
            alreadyProcessed: resultado.alreadyProcessed ?? false,
            newDueDate: resultado.newDueDate,
        });
    } catch (error) {
        // Fallo pasajero: aquí sí conviene que Wompi reintente.
        console.error(`[wompi] Error aplicando la transacción ${idTransaccion}:`, error);
        return NextResponse.json(
            { success: false, message: "Error procesando el pago." },
            { status: 500 }
        );
    }
}
