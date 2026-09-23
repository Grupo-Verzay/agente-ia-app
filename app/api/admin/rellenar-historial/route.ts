import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { esSuperAdminDeVerdad } from '@/lib/super-admin-de-verdad';
import {
  estadoDelRelleno,
  laLineaDelRelleno,
  proveedorDeLaLinea,
  rellenarLaLinea,
  rellenarUnChat,
  revisarUnChat,
} from '@/lib/relleno-de-historial.server';

/**
 * Rellenar el historial de una línea con lo que su proveedor tiene y nosotros no
 * (ver `lib/relleno-de-historial.server.ts`).
 *
 * Solo superadministrador de verdad —con «Ingresar» puesto no cuenta— o una
 * llamada de servidor con la clave interna. Está bajo `/api/admin`, que el
 * middleware deja pasar sin sesión: la puerta es ESTA, no el middleware.
 *
 *   GET  ?linea=X                     → cómo va el relleno de la línea
 *   POST { linea, jid }               → revisa UN chat, sin escribir nada
 *   POST { linea, jid, escribir:true } → rellena UN chat
 *   POST { linea, todos:true }        → lanza la línea entera de fondo (202);
 *                                       relanzarlo retoma donde se quedó
 *   POST { linea, todos:true, desdeCero:true } → la empieza otra vez
 */

function porClave(request: Request): boolean {
  const esperada = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!esperada) return false;
  const bearer = request.headers.get('authorization');
  const secreta = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secreta === esperada;
}

async function autorizado(request: Request): Promise<boolean> {
  if (porClave(request)) return true;
  return esSuperAdminDeVerdad(await currentUser());
}

export async function GET(request: Request) {
  if (!(await autorizado(request))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const linea = new URL(request.url).searchParams.get('linea')?.trim();
  if (!linea) return NextResponse.json({ error: 'Falta la línea (?linea=)' }, { status: 400 });
  return NextResponse.json({ estado: await estadoDelRelleno(linea) });
}

export async function POST(request: Request) {
  if (!(await autorizado(request))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nombre = typeof cuerpo.linea === 'string' ? cuerpo.linea.trim() : '';
  if (!nombre) return NextResponse.json({ error: 'Falta la línea' }, { status: 400 });

  const linea = await laLineaDelRelleno(nombre);
  if (!linea) return NextResponse.json({ error: `No existe la línea ${nombre}` }, { status: 404 });

  if (cuerpo.todos === true) {
    // De fondo: el avance vive en la tabla, no en esta promesa. Si un
    // despliegue se la lleva, volver a lanzarlo sigue por el chat siguiente.
    void rellenarLaLinea(linea, { desdeCero: cuerpo.desdeCero === true }).then((r) => {
      if (!r.ok) console.warn('[relleno] no se lanzó o se cortó', { linea: nombre, motivo: r.motivo });
    });
    return NextResponse.json({ lanzado: true, comoVa: `GET /api/admin/rellenar-historial?linea=${nombre}` }, { status: 202 });
  }

  const jid = typeof cuerpo.jid === 'string' ? cuerpo.jid.trim() : '';
  if (!jid) return NextResponse.json({ error: 'Falta el chat (jid) o todos:true' }, { status: 400 });

  const proveedor = await proveedorDeLaLinea(linea);
  if (!proveedor) {
    return NextResponse.json(
      { error: 'La línea no es de WhatsApp por QR o no tiene credenciales de su proveedor.' },
      { status: 422 },
    );
  }
  const informe =
    cuerpo.escribir === true
      ? await rellenarUnChat(linea, proveedor, jid)
      : await revisarUnChat(linea, proveedor, jid);
  if (!informe) return NextResponse.json({ error: 'El proveedor no devolvió el historial de ese chat' }, { status: 502 });
  return NextResponse.json({ escrito: cuerpo.escribir === true, informe });
}
