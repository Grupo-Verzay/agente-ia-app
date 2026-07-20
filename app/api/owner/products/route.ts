import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerProducts } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/products — productos/catálogo del dueño (solo lectura):
 * título, precio, stock, activo, categoría. onlyActive filtra los publicados.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, onlyActive?, limit? }
 */
const bodySchema = ownerBaseSchema.extend({
  onlyActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const products = await listOwnerProducts(guard.owner.ownerId, {
      onlyActive: guard.body.onlyActive,
      limit: guard.body.limit,
    });
    return NextResponse.json({ success: true, count: products.length, products }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/products]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar los productos." }, { status: 500 });
  }
}
