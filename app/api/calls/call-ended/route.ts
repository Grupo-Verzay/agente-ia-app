import { NextResponse } from 'next/server';
import { procesarElFinDeLaLlamada } from '@/lib/grabacion-de-llamada.server';

/**
 * «Esta llamada terminó»: lo dice el servidor de llamadas, no un reloj nuestro.
 *
 * Hasta ahora **no existía ningún aviso de fin**. La plataforma lanzaba la
 * llamada y se ponía a sondear la grabación a ciegas desde una promesa suelta
 * dentro de una petición — y con decenas de despliegues al día, esa promesa se
 * muere sin dejar rastro. Desde fuera: la llamada sale, se habla varios
 * minutos, se cuelga, y en CRM › Llamadas no queda **ni la duración**.
 *
 * El camino es AstraCalls → backend → aquí, y no se inventó ninguna tubería:
 * AstraCalls ya tiene configurado `VOICEBOT_RESOLVE_URL` hacia el backend, así
 * que el aviso sale por ahí con su mismo secreto, y el backend lo relaya a esta
 * ruta con el interno de siempre.
 *
 * Dos cosas de esta ruta:
 *
 * 1. **Lleva su clave, no confía en el middleware.** Es una ruta para el
 *    backend, así que se autentica igual que `/api/calls/process-bot-recording`:
 *    `CRM_FOLLOW_UP_RUNNER_KEY`, por `Authorization: Bearer` o
 *    `x-internal-secret`.
 * 2. **Contesta en cuanto ha escrito la duración**, y deja la grabación de
 *    fondo. Quien avisa es el servidor de llamadas cerrando una llamada: no
 *    puede quedarse esperando a que OpenAI conteste.
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
  const astraSid = typeof body?.sid === 'string' ? body.sid.trim() : '';
  const astraCallId = typeof body?.callId === 'string' ? body.callId.trim() : '';
  if (!astraSid || !astraCallId) {
    return NextResponse.json({ error: 'sid y callId son requeridos' }, { status: 400 });
  }

  // `durationSecs` que no venga NO es cero: es «no lo dijo», y un cero borraría
  // del tiempo hablado una llamada que sí ocurrió. Se pasa 0 y `anotarQueHay
  // Grabacion` se queda con lo mayor entre eso y lo que ya hubiera en la fila,
  // que para el caso es dejarlo como está.
  const bruto = Number(body?.durationSecs);
  const durationSecs = Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto) : 0;

  const resultado = await procesarElFinDeLaLlamada({
    astraSid,
    astraCallId,
    durationSecs,
    // Solo un `false` explícito significa «no hay audio». Sin el campo es «no
    // se sabe», y darlo por falso dejaría sin transcribir una grabación que sí
    // está — lo mismo que ya decide `abierta` en las tarjetas de reunión.
    hasRecording: body?.hasRecording !== false,
    // Solo de una llamada del BOT sabe AstraCalls si se contestó (arranca el
    // bot al conectar). En una manual `answered` viaja en falso siempre, así
    // que no se da por dicho.
    answered: body?.isBot === true && body?.answered === false ? false : undefined,
  });

  return NextResponse.json(resultado, { status: resultado.success ? 202 : 404 });
}
