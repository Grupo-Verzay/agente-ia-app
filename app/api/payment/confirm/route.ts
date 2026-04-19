import { NextResponse } from "next/server";
import { PaymentSource } from "@prisma/client";

import { confirmPaymentInternal } from "@/actions/billing/billing-payment-internal";

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

function parseBody(raw: unknown): { data: ConfirmPaymentBody } | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Body inválido." };
    const b = raw as Record<string, unknown>;

    if (!b.clientUserId || typeof b.clientUserId !== "string")
        return { error: "clientUserId es requerido." };
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
            clientUserId: b.clientUserId.trim(),
            amount,
            currencyCode,
            source: b.source as PaymentSource,
            externalReference: b.externalReference.trim(),
            notes: typeof b.notes === "string" ? b.notes.trim() || null : null,
        },
    };
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

    const result = await confirmPaymentInternal(parsed.data);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
