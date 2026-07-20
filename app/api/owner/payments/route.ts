import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerPayments } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/payments — movimientos de finanzas del dueño (solo lectura).
 * scope "income" (ventas/ingresos, por defecto) o "expenses" (gastos). Excluye
 * anulados/eliminados.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, scope?, limit? }
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["income", "expenses"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const payments = await listOwnerPayments(guard.owner.ownerId, {
      scope: guard.body.scope,
      limit: guard.body.limit,
    });
    return NextResponse.json({ success: true, count: payments.length, payments }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/payments]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar los pagos." }, { status: 500 });
  }
}
