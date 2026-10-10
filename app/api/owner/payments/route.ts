import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerPayments } from "@/lib/owner-commands";

/**
 * POST /api/owner/payments — ingresos (ventas) o gastos.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["income", "expenses"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_pagos", async (quien, body) => {
    const payments = await listOwnerPayments(quien.cuentaId, { scope: body.scope, limit: body.limit });
    return { count: payments.length, payments };
  });
}
