import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization');
  const secret = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secret === expected;
}

/**
 * GET /api/products
 *
 * Endpoint para que NestJS consulte el catálogo de productos en tiempo real.
 * Usado por los toolTypes: 'buscar_producto' y 'listar_productos'.
 *
 * Query params:
 *   userId    — requerido
 *   q         — opcional: búsqueda por nombre (insensible a mayúsculas)
 *   category  — opcional: filtrar por categoría exacta
 *   sku       — opcional: buscar por SKU exacto
 *   onlyActive — opcional: "true" (default) = solo productos activos
 *
 * Respuesta:
 *   { products: [...], total: N }
 *
 * Ejemplos:
 *   GET /api/products?userId=abc                         → catálogo completo activo
 *   GET /api/products?userId=abc&q=plan                  → buscar por nombre
 *   GET /api/products?userId=abc&category=Agente         → filtrar por categoría
 *   GET /api/products?userId=abc&sku=ABC-001             → buscar por SKU
 *   GET /api/products?userId=abc&q=plan&onlyActive=false → incluir inactivos
 *
 * Campos retornados por producto:
 *   id, title, description, price, sku, stock, isActive, category, tags, images
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId     = searchParams.get('userId')?.trim();
  const q          = searchParams.get('q')?.trim();
  const category   = searchParams.get('category')?.trim();
  const sku        = searchParams.get('sku')?.trim();
  const onlyActive = searchParams.get('onlyActive') !== 'false'; // default true

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const where: Prisma.ProductWhereInput = {
    userId,
    ...(onlyActive && { isActive: true }),
    ...(q && { title: { contains: q, mode: Prisma.QueryMode.insensitive } }),
    ...(category && { category: { equals: category, mode: Prisma.QueryMode.insensitive } }),
    ...(sku && { sku }),
  };

  const products = await db.product.findMany({
    where,
    orderBy: { title: 'asc' },
    take: 50,
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      sku: true,
      stock: true,
      isActive: true,
      category: true,
      tags: true,
      images: true,
    },
  });

  const normalized = products.map((p) => ({
    ...p,
    price: Number(p.price),
  }));

  return NextResponse.json(
    { products: normalized, total: normalized.length },
    { status: 200 },
  );
}
