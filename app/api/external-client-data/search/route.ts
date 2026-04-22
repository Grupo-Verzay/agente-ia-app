import { NextResponse } from 'next/server';
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
 * GET /api/external-client-data/search
 *
 * Busca registros de datos externos por cualquier campo del JSON.
 *
 * Query params:
 *   userId  — requerido
 *   field   — requerido: nombre exacto de la columna en el JSON (ej: "CEDULA")
 *   value   — requerido: valor a buscar
 *   exact   — opcional: "true" (default) = coincidencia exacta | "false" = contiene el texto
 *
 * Respuesta:
 *   { data: [...records], total: N }
 *
 * Ejemplos:
 *   ?userId=abc&field=CEDULA&value=12345678
 *   ?userId=abc&field=CORREO&value=cliente@gmail.com
 *   ?userId=abc&field=NOMBRE&value=juan&exact=false
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();
  const field  = searchParams.get('field')?.trim();
  const value  = searchParams.get('value')?.trim();
  const exact  = searchParams.get('exact') !== 'false'; // default true

  if (!userId || !field || !value) {
    return NextResponse.json(
      { error: 'userId, field and value are required' },
      { status: 400 },
    );
  }

  if (field.length > 100 || value.length > 500) {
    return NextResponse.json(
      { error: 'field or value exceeds maximum length' },
      { status: 400 },
    );
  }

  const jsonFilter = exact
    ? { path: [field], equals: value }
    : { path: [field], string_contains: value };

  const records = await db.externalClientData.findMany({
    where: { userId, data: jsonFilter },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  return NextResponse.json(
    { data: records, total: records.length },
    { status: 200 },
  );
}
