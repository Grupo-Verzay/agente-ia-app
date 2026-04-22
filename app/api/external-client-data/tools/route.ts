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
 * GET /api/external-client-data/tools
 *
 * Devuelve las herramientas configuradas para un cliente.
 * NestJS consume este endpoint para construir las tool definitions de Claude
 * en tiempo real, sin hardcodear nada.
 *
 * Query params:
 *   userId       — requerido
 *   enabledOnly  — opcional: "true" (default) = solo habilitadas | "false" = todas
 *
 * Respuesta por herramienta:
 *   toolKey         → nombre técnico que Claude usa al invocar la tool
 *   displayName     → nombre legible
 *   toolDescription → descripción que ve el LLM (define cuándo invocarla)
 *   toolCategory    → "builtin" | "data_query"
 *   toolType        → "notificacion_asesor" | "search_by_field" | "auto_inject" | ...
 *   searchField     → campo JSON a buscar (solo para toolType=search_by_field)
 *   promptTemplate  → plantilla de respuesta opcional
 *   isEnabled       → boolean
 *   sortOrder       → orden de aparición
 *
 * Ejemplo de uso en NestJS:
 *   GET /api/external-client-data/tools?userId=abc123
 *   → construye las tools para Claude con toolKey como name y toolDescription como description
 *   → para toolType=search_by_field: al recibir el tool call, llama /search?field={searchField}&value={arg}
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId      = searchParams.get('userId')?.trim();
  const enabledOnly = searchParams.get('enabledOnly') !== 'false'; // default true

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const tools = await db.externalDataToolConfig.findMany({
    where: {
      userId,
      ...(enabledOnly && { isEnabled: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      toolKey: true,
      displayName: true,
      toolDescription: true,
      toolCategory: true,
      toolType: true,
      searchField: true,
      promptTemplate: true,
      isEnabled: true,
      sortOrder: true,
    },
  });

  return NextResponse.json({ tools, total: tools.length }, { status: 200 });
}
