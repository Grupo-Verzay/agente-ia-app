import { NextResponse } from "next/server";
import { PaymentSource } from "@prisma/client";

import { confirmPaymentInternal } from "@/actions/billing/billing-payment-internal";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Auth — mismo patrón que /api/cron/billing
// ---------------------------------------------------------------------------

function getRequestSecret(request: Request): string {
    const bearer = request.headers.get("authorization");
    if (bearer?.startsWith("Bearer ")) {
        return bearer.slice("Bearer ".length).trim();
    }
    return (request.headers.get("x-cron-secret") ?? "").trim();
}

function isAuthorized(request: Request): boolean {
    const expected = (process.env.CRON_SECRET ?? "").trim();
    if (!expected) return false;
    return getRequestSecret(request) === expected;
}

// ---------------------------------------------------------------------------
// Validación del body
// ---------------------------------------------------------------------------

const VALID_SOURCES: PaymentSource[] = ["WHATSAPP_RECEIPT", "WOMPI_WEBHOOK", "MANUAL"];

type ConfirmPaymentBody = {
    clientUserId: string;
    amount: number;
    currencyCode: string;
    source: PaymentSource;
    externalReference: string;
    notes?: string | null;
};

type ConfirmPaymentInput = Omit<ConfirmPaymentBody, "clientUserId"> & {
    clientUserId?: string;
    clientEmail?: string;
};

function parseBody(raw: unknown): { data: ConfirmPaymentInput } | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Body inválido." };
    const b = raw as Record<string, unknown>;

    // Se acepta el cliente por identificador O por correo. El identificador lo
    // conoce quien ya está dentro de la plataforma (el webhook de Wompi lo saca
    // de la referencia del pago), pero una tienda externa —WooCommerce— solo
    // conoce el correo del comprador. Sin esto, integrar la tienda obligaría a
    // meterle nuestro identificador interno a cada producto, que es justo lo que
    // nadie va a mantener.
    const clientUserId = typeof b.clientUserId === "string" ? b.clientUserId.trim() : "";
    const clientEmail = typeof b.clientEmail === "string" ? b.clientEmail.trim().toLowerCase() : "";
    if (!clientUserId && !clientEmail)
        return { error: "clientUserId o clientEmail es requerido." };
    if (!b.externalReference || typeof b.externalReference !== "string")
        return { error: "externalReference es requerido." };
    if (!b.source || !VALID_SOURCES.includes(b.source as PaymentSource))
        return { error: `source debe ser uno de: ${VALID_SOURCES.join(", ")}.` };

    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0)
        return { error: "amount debe ser un número positivo." };

    const currencyCode =
        typeof b.currencyCode === "string" && /^[A-Z]{3}$/.test(b.currencyCode.trim().toUpperCase())
            ? b.currencyCode.trim().toUpperCase()
            : "COP";

    return {
        data: {
            clientUserId: clientUserId || undefined,
            clientEmail: clientEmail || undefined,
            amount,
            currencyCode,
            source: b.source as PaymentSource,
            externalReference: b.externalReference.trim(),
            notes: typeof b.notes === "string" ? b.notes.trim() || null : null,
        },
    };
}

/**
 * Traduce el correo del comprador a la cuenta que hay que renovar.
 *
 * Solo cuentas principales: un asesor no tiene servicio propio, lo tiene su
 * cuenta madre. Renovarle a un asesor no activaría nada y el pago quedaría
 * aplicado donde no toca.
 */
async function resolverCliente(
    input: ConfirmPaymentInput,
): Promise<{ clientUserId: string } | { error: string }> {
    if (input.clientUserId) return { clientUserId: input.clientUserId };

    const usuario = await db.user.findFirst({
        where: { email: { equals: input.clientEmail, mode: "insensitive" }, ownerId: null },
        select: { id: true },
    });

    if (!usuario) {
        // Se responde con el correo para que quede en el registro de la tienda:
        // el fallo típico es un correo distinto al de la cuenta, y sin verlo el
        // pago parece "perdido" sin explicación.
        return { error: `No hay ninguna cuenta con el correo ${input.clientEmail}.` };
    }

    return { clientUserId: usuario.id };
}

// ---------------------------------------------------------------------------
// POST /api/payment/confirm
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json(
            { success: false, message: "CRON_SECRET no está configurado." },
            { status: 500 }
        );
    }

    if (!isAuthorized(request)) {
        return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
    }

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: "JSON inválido." }, { status: 400 });
    }

    const parsed = parseBody(raw);
    if ("error" in parsed) {
        return NextResponse.json({ success: false, message: parsed.error }, { status: 400 });
    }

    const cliente = await resolverCliente(parsed.data);
    if ("error" in cliente) {
        return NextResponse.json({ success: false, message: cliente.error }, { status: 404 });
    }

    const { clientEmail: _correo, ...resto } = parsed.data;
    const result = await confirmPaymentInternal({ ...resto, clientUserId: cliente.clientUserId });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
