import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerProducts } from "@/lib/owner-commands";

/**
 * POST /api/owner/products — catálogo (título, precio, stock, activo).
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  onlyActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_productos", async (quien, body) => {
    const products = await listOwnerProducts(quien.cuentaId, { onlyActive: body.onlyActive, limit: body.limit });
    return { count: products.length, products };
  });
}
