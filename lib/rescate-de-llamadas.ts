/**
 * La red de abajo: una llamada que colgó y de la que nadie avisó.
 *
 * # El fallo del que viene
 *
 * «La llamada con IA sale, se habla varios minutos, se cuelga, y en CRM ›
 * Llamadas la Duración queda en una rayita y no hay ni Resumen ni
 * Transcripción.» Eso ya se arregló una vez (#877) con un **aviso de fin de
 * llamada**: AstraCalls → backend → App. Y volvió al día siguiente, después de
 * que se cayera Postgres y se volvieran a desplegar dos stacks a mano desde el
 * editor de Portainer.
 *
 * Volvió porque ese aviso, siendo lo correcto, **es una cadena de tres
 * servicios sin una sola red debajo**:
 *
 * | eslabón | de qué depende | qué pasa si falta |
 * | --- | --- | --- |
 * | AstraCalls → backend | `VOICEBOT_RESOLVE_URL` con `/resolve` dentro | un `log.Warn` en un servidor que nadie lee |
 * | backend → App | `NEXTJS_URL` + `CRM_FOLLOW_UP_RUNNER_KEY` | otro `logger.warn` |
 * | la imagen del backend | que el redespliegue no haya fijado un digest viejo | un `404` que solo ve AstraCalls |
 *
 * Los tres se configuran **a mano en un editor de Portainer**, los tres fallan
 * mudos, y ninguno deja nada en la base. Así que el día que uno se cae, lo que
 * se ve desde fuera es exactamente el síntoma original y no hay dónde mirar.
 *
 * Y lo que había debajo **no era una red**: `esperarYProcesarLaGrabacion` es
 * una promesa suelta (`void`) dentro de una petición, en un proceso que se
 * despliega decenas de veces al día y corre a dos réplicas. Un despliegue se la
 * lleva sin dejar rastro ni a quien retomarla. Es la misma familia que este
 * documento ya describe en *una recarga tiene que decir por qué*: lo que vive
 * solo en memoria no sobrevive a nada.
 *
 * > **La red tiene que salir de la BASE, no de la memoria de nadie.** Una
 * > llamada que se lanzó dejó su fila con su par de ids dentro; con eso se
 * > puede volver a ella desde cero, en otro proceso, en otro contenedor y tres
 * > despliegues después. Eso es lo único que sobrevive a un redespliegue del
 * > stack, y es lo que este módulo decide.
 *
 * # Y el número de rescates ES la alarma
 *
 * Esto no viene a sustituir el aviso de fin: viene a que su caída deje de ser
 * invisible. Si el barrido no rescata nada, la cadena funciona. Si empieza a
 * rescatar, **algún eslabón está roto** y el contador lo dice sin que haya que
 * entrar a ningún servidor. Es la misma idea que *una línea muerta no tiene
 * filas: se cuenta desde `Instancias`* — el cero es el dato.
 *
 * Este fichero es **puro**: no toca la base ni la red, así que lo que decide se
 * prueba entero sin levantar nada.
 */

import { laMarcaDeLaLlamada } from '@/lib/transcripcion-de-la-llamada';
import { sePuedeReintentar } from '@/lib/transcripcion-de-voz';

/** Cuántas llamadas se rescatan como mucho en una vuelta.
 *
 * Va a trozos por lo mismo que la limpieza del sufijo de dispositivo: la
 * primera vuelta después de una caída puede encontrarse con las llamadas de
 * horas, y cada rescate **se baja el WAV entero** para transcribirlo. Sin tope,
 * una vuelta se quedaría minutos ocupando el pool de Prisma y la red mientras
 * alguien espera a que le abra Chats. Lo que no entre en esta vuelta entra en
 * la siguiente: la fila no se va a ninguna parte. */
export const TOPE_POR_VUELTA = 10;

/** Cuántas se rescatan en la vuelta del cron DIARIO, que es otra cosa.
 *
 * Esa ruta la llama el reloj de facturación del backend, que corta a los 20
 * segundos con un `AbortController`. Un rescate se baja un WAV y lo
 * transcribe, así que con el tope de arriba esa vuelta se pasa del plazo y el
 * backend apunta un fallo diario **sobre un cobro que sí se hizo**. Un aviso
 * que sale todos los días se aprende a despachar sin leer, y entonces deja de
 * avisar el día que el cobro falle de verdad. Aquí la red es de propina: el
 * grueso lo hace el reloj de diez minutos, que no tiene prisa. */
export const TOPE_EN_LA_VUELTA_DIARIA = 2;

/** Cuántos días atrás se mira.
 *
 * El mismo `DIAS_PARA_BUSCAR_LA_LLAMADA` del aviso de fin, y por el mismo
 * motivo que allí: es lo que deja entrar por el BRIN de `messageTimestamp` en
 * vez de recorrer `chat_messages` entera, que es la tabla más grande de la
 * plataforma. Dos días cubren de sobra una caída de una noche. */
export const VENTANA_DE_RESCATE_DIAS = 2;

/** Cuánto tiene que haber pasado desde que se lanzó la llamada.
 *
 * **Una llamada en curso no está rota: está en curso.** Sin este margen el
 * barrido se pondría a pedirle a AstraCalls la grabación de una conversación
 * que todavía se está teniendo —que no existe hasta que alguien cuelga— y
 * gastaría sus intentos antes de que hubiera nada que rescatar. */
export const EDAD_MINIMA_MS = 15 * 60_000;

/** Cuánto se espera entre dos intentos sobre la misma llamada. */
export const ESPERA_ENTRE_RESCATES_MS = 20 * 60_000;

/** Cuántas veces se reintenta una misma llamada, como mucho.
 *
 * Con la espera de arriba son unas tres horas de cobertura a partir del margen
 * inicial, o sea más que la llamada más larga que nadie va a tener. Y tiene que
 * haber un tope: sin él, una llamada que no se puede transcribir —sin créditos,
 * un audio imposible— se bajaría su WAV cada vuelta **para siempre**. Es la
 * misma regla que *«flake» no es una causa*: reintentar no es gratis. */
export const TOPE_DE_RESCATES = 8;

/** Lo que el barrido escribe en la fila para no reintentar sin freno. */
export type SelloDeRescate = { intentos: number; ultimoEn: string };

export type LlamadaParaRescatar = {
  astraSid?: unknown;
  astraCallId?: unknown;
  transcript?: unknown;
  durationSecs?: unknown;
  hasRecording?: unknown;
  rescate?: unknown;
  /** Por qué no se transcribió, si ya se sabe (`lib/transcripcion-de-la-llamada`). */
  transcripcion?: unknown;
};

export type Veredicto =
  | { rescatar: true; que: 'cerrar' | 'transcribir'; intento: number }
  | {
      rescatar: false;
      motivo: 'sin_ids' | 'ya_esta' | 'sin_audio' | 'en_curso' | 'todavia_no' | 'agotada' | 'firme';
    };

function comoTexto(valor: unknown): string {
  return typeof valor === 'string' || typeof valor === 'number' ? String(valor).trim() : '';
}

/** El sello que ya tiene la fila, saneado. Lo que no se entienda cuenta como
 * «nunca se intentó»: se ve de menos, nunca de más — equivocarse hacia «ya lo
 * intenté 8 veces» dejaría una llamada sin rescatar y sin decir por qué. */
export function elSelloQueTrae(valor: unknown): SelloDeRescate | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const crudo = valor as Record<string, unknown>;
  const intentos = Number(crudo.intentos);
  const ultimoEn = comoTexto(crudo.ultimoEn);
  if (!Number.isFinite(intentos) || intentos < 0) return null;
  const cuando = Date.parse(ultimoEn);
  if (!Number.isFinite(cuando)) return null;
  return { intentos: Math.floor(intentos), ultimoEn };
}

/**
 * Qué le falta a una llamada, y si toca rescatarla ahora.
 *
 * El orden de las comprobaciones **no es intercambiable**, y cada una tapa un
 * caso que se lee distinto desde fuera:
 *
 * 1. **Sin el par de ids no hay a quién preguntarle.** No es una llamada rota:
 *    es una que no dejó forma de volver a ella (o una de Meta, que va por otro
 *    camino). Reintentarla sería quemar vueltas sobre algo que nunca va a dar.
 * 2. **Con transcripción, ya está.** Es el mismo marcador con el que
 *    `processCallRecordingForUser` se declara idempotente.
 * 3. **`hasRecording === false` es AstraCalls diciendo que no hay audio.** Esa
 *    llamada está cerrada y correcta: tiene su duración y no va a tener
 *    transcripción nunca. Sin esta rama se quedaría en el barrido para siempre.
 *    Y solo un `false` explícito cuenta — sin el campo es «no se sabe», que es
 *    justo lo que hay que ir a mirar.
 * 4. **En curso no es rota** (ver `EDAD_MINIMA_MS`).
 * 5. **El tope y la espera**, que es lo que impide que esto sea un bucle.
 */
export function queLeFaltaALaLlamada(input: {
  call: LlamadaParaRescatar | null | undefined;
  edadMs: number;
  ahoraMs: number;
}): Veredicto {
  const call = input.call ?? {};

  if (!comoTexto(call.astraSid) || !comoTexto(call.astraCallId)) {
    return { rescatar: false, motivo: 'sin_ids' };
  }
  if (comoTexto(call.transcript)) return { rescatar: false, motivo: 'ya_esta' };
  if (call.hasRecording === false) return { rescatar: false, motivo: 'sin_audio' };
  // **Un motivo que no mejora reintentando se respeta.** Cada rescate se baja
  // el WAV entero, así que insistir ocho veces sobre una cuenta sin créditos o
  // sin clave de IA es bajarse ocho veces un audio para volver a abandonar en
  // el mismo sitio. Lo de HOY —que OpenAI no contestara, que el audio no
  // estuviera— sí se reintenta: es justo para lo que está el barrido.
  const marca = laMarcaDeLaLlamada(call.transcripcion);
  if (marca && !sePuedeReintentar(marca.motivo)) return { rescatar: false, motivo: 'firme' };
  if (input.edadMs < EDAD_MINIMA_MS) return { rescatar: false, motivo: 'en_curso' };

  const sello = elSelloQueTrae(call.rescate);
  if (sello) {
    if (sello.intentos >= TOPE_DE_RESCATES) return { rescatar: false, motivo: 'agotada' };
    const desde = Date.parse(sello.ultimoEn);
    if (input.ahoraMs - desde < ESPERA_ENTRE_RESCATES_MS) {
      return { rescatar: false, motivo: 'todavia_no' };
    }
  }

  const segundos = Number(call.durationSecs);
  // Con duración, el aviso de fin sí llegó y lo que falta es el audio; sin
  // ella, no llegó nadie. Las dos se arreglan con la misma llamada —bajar la
  // grabación escribe la duración de paso— y la distinción es para el informe:
  // «cerrar» contándose solo ya dice que la cadena del aviso está caída.
  const que = Number.isFinite(segundos) && segundos > 0 ? 'transcribir' : 'cerrar';
  return { rescatar: true, que, intento: (sello?.intentos ?? 0) + 1 };
}

/** El sello que se escribe después de intentarlo. Se escribe **se haya logrado
 * o no**: es lo que gasta el presupuesto de intentos, y sin eso una llamada que
 * falla se reintentaría en cada vuelta. */
export function elSiguienteSello(anterior: unknown, ahora: Date): SelloDeRescate {
  const sello = elSelloQueTrae(anterior);
  return { intentos: (sello?.intentos ?? 0) + 1, ultimoEn: ahora.toISOString() };
}
