import { NextResponse } from 'next/server';
import { rescatarLlamadasSinCerrar } from '@/lib/rescate-de-llamadas.server';

/**
 * «¿Quedó alguna llamada sin cerrar?» — la red de abajo del aviso de fin.
 *
 * El aviso de fin de llamada (`/api/calls/call-ended`) es el camino bueno y no
 * cambia. Esto es lo que hace que su caída **no sea invisible ni definitiva**:
 * un barrido que sale de la BASE, así que sobrevive a un redespliegue de
 * cualquiera de los tres stacks, a una variable de entorno perdida en el editor
 * de Portainer y a que el backend se levante con una imagen vieja. El porqué
 * está entero en `lib/rescate-de-llamadas.ts`.
 *
 * **La clave es la misma que la del aviso de fin** (`CRM_FOLLOW_UP_RUNNER_KEY`,
 * por `Authorization: Bearer` o `x-internal-secret`), a propósito: son las dos
 * rutas del mismo camino, y dos claves serían una más que puede perderse en un
 * redespliegue — que es exactamente el fallo del que viene todo esto.
 *
 * Contesta con el informe, y lo que hay que mirar es **`sinAviso`**: si no es
 * cero, la cadena AstraCalls → backend → App está rota ahora mismo.
 */

function autorizado(request: Request): boolean {
  const esperado = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!esperado) return false;
  const bearer = request.headers.get('authorization');
  const secreto = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secreto === esperado;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const pedido = Number(body?.limite);
  const limite = Number.isFinite(pedido) && pedido > 0 ? Math.floor(pedido) : undefined;

  const informe = await rescatarLlamadasSinCerrar(limite ? { limite } : {});
  return NextResponse.json({ success: true, ...informe });
}
